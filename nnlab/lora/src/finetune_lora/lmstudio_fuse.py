from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import uuid
from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import load_config, nested, resolve_path

MODEL_PREFIX = "eofnnlab"
DEFAULT_PUBLISHER = "eofnnlab"
DEFAULT_HUB_OWNER = "eofnnlab"
MODEL_INDEX = "model.safetensors.index.json"
PREFERRED_CHAT_TEMPLATE = "gemma-4-chat-template-fixed.jinja"
COPY_BUFFER_SIZE = 8 * 1024 * 1024

FuseRunner = Callable[[Sequence[str]], None]


@dataclass(frozen=True)
class InstallPlan:
    base_model: Path
    adapter: Path
    lmstudio_root: Path
    model_name: str
    publisher: str
    hub_owner: str
    hub_name: str
    concrete_model_key: str
    hub_model_id: str
    model_path: Path
    hub_path: Path
    user_defaults_path: Path


@dataclass(frozen=True)
class InstallResult:
    plan: InstallPlan
    adapter_sha256: str


def _json_file(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot read valid JSON from {path}: {error}") from error
    if not isinstance(value, dict):
        raise TypeError(f"Expected a JSON object in {path}")
    return value


def _safe_component(value: str, *, label: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", value):
        raise ValueError(
            f"{label} must contain only letters, numbers, dots, underscores, and hyphens"
        )
    if value in {".", ".."}:
        raise ValueError(f"Invalid {label}: {value}")
    return value


def normalize_model_name(value: str | None, adapter: Path) -> str:
    requested = value or adapter.name
    if not requested.lower().startswith(f"{MODEL_PREFIX.lower()}-"):
        requested = f"{MODEL_PREFIX}-{requested}"
    return _safe_component(requested, label="model name")


def hub_name_for_model(model_name: str) -> str:
    prefix = f"{MODEL_PREFIX}-"
    alias = (
        model_name[len(prefix) :]
        if model_name.lower().startswith(prefix.lower())
        else model_name
    )
    return _hub_component(alias, label="hub model name")


def _hub_component(value: str, *, label: str) -> str:
    component = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not component or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", component):
        raise ValueError(f"Cannot derive a valid LM Studio {label} from: {value}")
    return component


def resolve_base_model(
    adapter: Path,
    explicit: str | Path | None,
    config: dict[str, Any] | None = None,
) -> Path:
    if explicit is not None:
        return Path(explicit).expanduser().resolve()

    setup_path = adapter / "train_setup.json"
    if setup_path.is_file():
        model = _json_file(setup_path).get("model")
        if isinstance(model, str) and model.strip():
            return Path(model).expanduser().resolve()

    if config is not None:
        model = nested(config, "model", "id")
        if isinstance(model, str) and model.strip():
            path = resolve_path(model)
            if path.is_dir():
                return path

    if not setup_path.is_file():
        raise FileNotFoundError(
            f"Cannot infer the pristine base model because {setup_path} is missing. "
            "Pass --base-model explicitly or provide a config with model.id."
        )
    raise ValueError(f"{setup_path} does not contain a non-empty 'model' path")


def resolve_adapter(
    adapter: str | Path | None,
    config: dict[str, Any] | None,
    config_path: str | Path,
) -> Path:
    if adapter is not None:
        return Path(adapter).expanduser().resolve()
    if config is None:
        raise ValueError(
            f"Provide --adapter or a valid --config (default: {config_path})"
        )
    value = nested(config, "deployment", "adapter") or nested(
        config, "training", "output_dir"
    )
    if not isinstance(value, str) or not value.strip():
        raise ValueError(
            f"Config {config_path} has neither deployment.adapter nor training.output_dir"
        )
    return resolve_path(value)


def build_plan(
    *,
    adapter: str | Path,
    lmstudio_root: str | Path,
    base_model: str | Path | None = None,
    model_name: str | None = None,
    publisher: str = DEFAULT_PUBLISHER,
    hub_owner: str = DEFAULT_HUB_OWNER,
    config: dict[str, Any] | None = None,
) -> InstallPlan:
    adapter_path = Path(adapter).expanduser().resolve()
    root = Path(lmstudio_root).expanduser().resolve()
    publisher = _safe_component(publisher, label="publisher")
    hub_owner = _hub_component(hub_owner, label="hub owner")
    name = normalize_model_name(model_name, adapter_path)
    hub_name = hub_name_for_model(name)
    concrete_key = f"{publisher}/{name}"
    hub_id = f"{hub_owner}/{hub_name}"
    return InstallPlan(
        base_model=resolve_base_model(adapter_path, base_model, config=config),
        adapter=adapter_path,
        lmstudio_root=root,
        model_name=name,
        publisher=publisher,
        hub_owner=hub_owner,
        hub_name=hub_name,
        concrete_model_key=concrete_key,
        hub_model_id=hub_id,
        model_path=root / "models" / publisher / name,
        hub_path=root / "hub" / "models" / hub_owner / hub_name,
        user_defaults_path=(
            root
            / ".internal"
            / "user-concrete-model-default-config"
            / publisher
            / f"{name}.json"
        ),
    )


def _validate_inputs(plan: InstallPlan, *, replace: bool = False) -> None:
    if not plan.base_model.is_dir():
        raise FileNotFoundError(f"Base model directory not found: {plan.base_model}")
    if not (plan.base_model / "config.json").is_file():
        raise FileNotFoundError(f"Base model config missing: {plan.base_model / 'config.json'}")
    if not (plan.base_model / MODEL_INDEX).is_file():
        raise FileNotFoundError(f"Base model index missing: {plan.base_model / MODEL_INDEX}")
    if not list(plan.base_model.glob("*.safetensors")):
        raise FileNotFoundError(f"Base model weights missing in {plan.base_model}")
    if not plan.adapter.is_dir():
        raise FileNotFoundError(f"Adapter directory not found: {plan.adapter}")
    for filename in ("adapter_config.json", "adapters.safetensors"):
        if not (plan.adapter / filename).is_file():
            raise FileNotFoundError(f"Adapter file missing: {plan.adapter / filename}")
    if not plan.lmstudio_root.is_dir():
        raise FileNotFoundError(f"LM Studio root not found: {plan.lmstudio_root}")
    if not replace:
        _ensure_destinations_available(plan)


def _ensure_destinations_available(plan: InstallPlan) -> None:
    collisions = [path for path in (plan.model_path, plan.hub_path) if path.exists()]
    if collisions:
        joined = ", ".join(str(path) for path in collisions)
        raise FileExistsError(
            f"Refusing to overwrite an existing LM Studio model or hub entry: {joined}. "
            "Choose a different --name."
        )


def _find_fuse_executable(explicit: str | Path | None) -> Path:
    if explicit is not None:
        executable = Path(explicit).expanduser().resolve()
    else:
        executable = Path(sys.executable).with_name("mlx_lm.fuse")
        if not executable.is_file():
            found = shutil.which("mlx_lm.fuse")
            if found is None:
                raise FileNotFoundError(
                    "mlx_lm.fuse is unavailable. Run scripts/setup.sh with MLX support first."
                )
            executable = Path(found).resolve()
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise FileNotFoundError(f"MLX fuse executable is not runnable: {executable}")
    return executable


def _run_fuse(command: Sequence[str]) -> None:
    subprocess.run(list(command), check=True)


def _copy_model_metadata(source: Path, destination: Path) -> str:
    """Restore exact base metadata that mlx_lm.fuse does not preserve completely."""
    for item in source.iterdir():
        if not item.is_file() or item.name.startswith("."):
            continue
        if item.suffix == ".safetensors" or item.name == MODEL_INDEX:
            continue
        if item.name == "README.md":
            continue
        shutil.copy2(item, destination / item.name)

    tokenizer_config_path = destination / "tokenizer_config.json"
    tokenizer_config = (
        _json_file(tokenizer_config_path) if tokenizer_config_path.is_file() else {}
    )
    preferred_template_path = source / PREFERRED_CHAT_TEMPLATE
    if preferred_template_path.is_file():
        chat_template = preferred_template_path.read_text(encoding="utf-8")
    else:
        embedded = tokenizer_config.get("chat_template")
        if isinstance(embedded, str) and embedded.strip():
            chat_template = embedded
        else:
            template_path = source / "chat_template.jinja"
            chat_template = (
                template_path.read_text(encoding="utf-8") if template_path.is_file() else ""
            )
    if chat_template:
        (destination / "chat_template.jinja").write_text(chat_template, encoding="utf-8")
        tokenizer_config["chat_template"] = chat_template
        tokenizer_config_path.write_text(
            json.dumps(tokenizer_config, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return chat_template


def _safetensors_header(path: Path) -> tuple[int, dict]:
    """Read and validate the JSON header without loading tensor data into memory."""
    try:
        file_size = path.stat().st_size
        with path.open("rb") as handle:
            raw_length = handle.read(8)
            if len(raw_length) != 8:
                raise ValueError("file is shorter than the 8-byte header length")
            header_length = struct.unpack("<Q", raw_length)[0]
            if header_length == 0 or header_length > file_size - 8:
                raise ValueError(f"invalid header length {header_length}")
            header = json.loads(handle.read(header_length).decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, struct.error, ValueError) as error:
        raise ValueError(f"Cannot read Safetensors header from {path}: {error}") from error
    if not isinstance(header, dict):
        raise TypeError(f"Expected a JSON object in Safetensors header: {path}")
    return 8 + header_length, header


def _tensor_entry(header: dict, key: str, path: Path, data_size: int) -> dict:
    entry = header.get(key)
    if not isinstance(entry, dict):
        raise TypeError(f"Safetensors tensor {key!r} is missing from {path}")
    offsets = entry.get("data_offsets")
    if (
        not isinstance(offsets, list)
        or len(offsets) != 2
        or not all(isinstance(value, int) for value in offsets)
        or offsets[0] < 0
        or offsets[1] < offsets[0]
        or offsets[1] > data_size
    ):
        raise ValueError(f"Invalid data offsets for Safetensors tensor {key!r} in {path}")
    if not isinstance(entry.get("dtype"), str) or not isinstance(entry.get("shape"), list):
        raise TypeError(f"Invalid metadata for Safetensors tensor {key!r} in {path}")
    return entry


def _copy_safetensors_subset(source: Path, destination: Path, keys: Sequence[str]) -> int:
    """Copy selected tensors byte-for-byte into a standalone Safetensors shard."""
    source_data_start, source_header = _safetensors_header(source)
    source_data_size = source.stat().st_size - source_data_start
    selected: list[tuple[str, int, int]] = []
    output_offset = 0
    output_header: dict = {}
    metadata = source_header.get("__metadata__")
    if isinstance(metadata, dict):
        output_header["__metadata__"] = metadata

    for key in sorted(keys):
        entry = _tensor_entry(source_header, key, source, source_data_size)
        start, end = entry["data_offsets"]
        length = end - start
        output_header[key] = {
            "dtype": entry["dtype"],
            "shape": entry["shape"],
            "data_offsets": [output_offset, output_offset + length],
        }
        selected.append((key, start, length))
        output_offset += length

    encoded_header = json.dumps(output_header, separators=(",", ":")).encode("utf-8")
    encoded_header += b" " * (-len(encoded_header) % 8)
    with source.open("rb") as input_handle, destination.open("xb") as output_handle:
        output_handle.write(struct.pack("<Q", len(encoded_header)))
        output_handle.write(encoded_header)
        for key, start, length in selected:
            input_handle.seek(source_data_start + start)
            remaining = length
            while remaining:
                block = input_handle.read(min(remaining, COPY_BUFFER_SIZE))
                if not block:
                    raise OSError(
                        f"Unexpected end of Safetensors data while copying {key!r} from {source}"
                    )
                output_handle.write(block)
                remaining -= len(block)
    return output_offset


def _restore_missing_base_weights(base_model: Path, fused_model: Path) -> set[str]:
    """Restore frozen multimodal weights that mlx_lm.fuse may omit from its output."""
    base_index = _json_file(base_model / MODEL_INDEX)
    fused_index_path = fused_model / MODEL_INDEX
    fused_index = _json_file(fused_index_path)
    base_weight_map = base_index.get("weight_map")
    fused_weight_map = fused_index.get("weight_map")
    if not isinstance(base_weight_map, dict) or not base_weight_map:
        raise RuntimeError(f"Base model index has no weight map: {base_model / MODEL_INDEX}")
    if not isinstance(fused_weight_map, dict) or not fused_weight_map:
        raise RuntimeError(f"Fused model index has no weight map: {fused_index_path}")

    missing = set(base_weight_map) - set(fused_weight_map)
    if not missing:
        return missing

    by_source_shard: dict[str, list[str]] = defaultdict(list)
    for key in sorted(missing):
        shard = base_weight_map[key]
        if not isinstance(shard, str):
            raise TypeError(f"Base model index has an invalid shard for tensor {key!r}")
        by_source_shard[shard].append(key)

    copied_size = 0
    shard_count = len(by_source_shard)
    staged_shards: list[tuple[Path, Path, list[str]]] = []
    committed_shards: list[Path] = []
    staged_index: Path | None = None
    try:
        for position, (source_name, keys) in enumerate(sorted(by_source_shard.items()), start=1):
            source_path = base_model / source_name
            if not source_path.is_file():
                raise RuntimeError(f"Base model index references missing shard: {source_path}")
            output_name = f"model-preserved-{position:05d}-of-{shard_count:05d}.safetensors"
            output_path = fused_model / output_name
            if output_path.exists():
                raise FileExistsError(f"Refusing to overwrite preserved model shard: {output_path}")
            staged_path = fused_model / f".{output_name}.tmp-{uuid.uuid4().hex}"
            staged_shards.append((staged_path, output_path, keys))
            copied_size += _copy_safetensors_subset(source_path, staged_path, keys)

        for staged_path, output_path, keys in staged_shards:
            os.replace(staged_path, output_path)
            committed_shards.append(output_path)
            fused_weight_map.update(dict.fromkeys(keys, output_path.name))

        metadata = fused_index.get("metadata")
        if not isinstance(metadata, dict):
            metadata = {}
            fused_index["metadata"] = metadata
        total_size = metadata.get("total_size")
        if isinstance(total_size, int):
            metadata["total_size"] = total_size + copied_size
        staged_index = fused_model / f".{MODEL_INDEX}.tmp-{uuid.uuid4().hex}"
        staged_index.write_text(
            json.dumps(fused_index, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        os.replace(staged_index, fused_index_path)
    except BaseException:
        for staged_path, _output_path, _keys in staged_shards:
            staged_path.unlink(missing_ok=True)
        if staged_index is not None:
            staged_index.unlink(missing_ok=True)
        for output_path in committed_shards:
            output_path.unlink(missing_ok=True)
        raise

    return missing


def _validate_fused_model(path: Path, *, base_model: Path | None = None) -> None:
    for filename in ("config.json", MODEL_INDEX, "tokenizer.json", "tokenizer_config.json"):
        if not (path / filename).is_file():
            raise RuntimeError(f"Fused model is incomplete; missing {path / filename}")

    index = _json_file(path / MODEL_INDEX)
    weight_map = index.get("weight_map")
    if not isinstance(weight_map, dict) or not weight_map:
        raise RuntimeError(f"Fused model index has no weight map: {path / MODEL_INDEX}")
    shards = {value for value in weight_map.values() if isinstance(value, str)}
    missing = sorted(shard for shard in shards if not (path / shard).is_file())
    if missing:
        raise RuntimeError(f"Fused model index references missing shards: {', '.join(missing)}")
    if base_model is not None:
        base_index = _json_file(base_model / MODEL_INDEX)
        base_weight_map = base_index.get("weight_map")
        if not isinstance(base_weight_map, dict) or not base_weight_map:
            raise RuntimeError(f"Base model index has no weight map: {base_model / MODEL_INDEX}")
        missing_weights = sorted(set(base_weight_map) - set(weight_map))
        if missing_weights:
            preview = ", ".join(missing_weights[:5])
            raise RuntimeError(
                f"Fused model is missing {len(missing_weights)} base tensors "
                f"after repair: {preview}"
            )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _context_length(config: dict) -> int | None:
    text_config = config.get("text_config")
    candidates = [
        text_config.get("max_position_embeddings") if isinstance(text_config, dict) else None,
        config.get("max_position_embeddings"),
    ]
    return next((value for value in candidates if isinstance(value, int) and value > 0), None)


def _yaml_block(value: str, indent: int) -> str:
    padding = " " * indent
    lines = value.rstrip("\n").splitlines() or [""]
    return "\n".join(f"{padding}{line}" for line in lines)


def render_model_yaml(plan: InstallPlan, config: dict, chat_template: str) -> str:
    architecture = str(config.get("model_type", "unknown"))
    context_length = _context_length(config)
    has_reasoning = "<|channel>thought" in chat_template and "<channel|>" in chat_template
    has_tools = "<|tool_call>" in chat_template and "<tool_call|>" in chat_template
    has_thinking_switch = "enable_thinking" in chat_template
    has_vision = isinstance(config.get("vision_config"), dict)

    lines = [
        "# Generated by finetune-lora. Local-only LM Studio model registration.",
        f"model: {json.dumps(plan.hub_model_id)}",
        "tags:",
        "  - local",
        "  - mlx",
        "  - fine-tuned",
        "base:",
        f"  - key: {json.dumps(plan.concrete_model_key)}",
        "    sources:",
        "      - type: huggingface",
        f"        user: {json.dumps(plan.publisher)}",
        f"        repo: {json.dumps(plan.model_name)}",
        "config:",
        "  operation:",
        "    fields:",
    ]
    if has_reasoning:
        lines.extend(
            [
                "      - key: llm.prediction.reasoning.parsing",
                "        value:",
                '          enabled: true',
                '          startString: "<|channel>thought"',
                '          endString: "<channel|>"',
            ]
        )
    if chat_template:
        lines.extend(
            [
                "      - key: llm.prediction.promptTemplate",
                "        value:",
                "          type: jinja",
                "          jinjaPromptTemplate:",
                "            template: |-",
                _yaml_block(chat_template, 14),
                "          stopStrings: []",
            ]
        )
    if has_thinking_switch:
        lines.extend(
            [
                "customFields:",
                "  - key: enableThinking",
                "    displayName: Enable Thinking",
                "    description: Controls whether the model will think before replying",
                "    type: boolean",
                "    defaultValue: true",
                "    effects:",
                "      - type: setJinjaVariable",
                "        variable: enable_thinking",
            ]
        )
    lines.extend(
        [
            "metadataOverrides:",
            "  domain: llm",
            "  architectures:",
            f"    - {json.dumps(architecture)}",
            "  compatibilityTypes:",
            "    - safetensors",
        ]
    )
    if context_length is not None:
        lines.extend(["  contextLengths:", f"    - {context_length}"])
    lines.extend(
        [
            f"  vision: {str(has_vision).lower()}",
            f"  reasoning: {str(has_reasoning).lower()}",
            f"  trainedForToolUse: {str(has_tools).lower()}",
        ]
    )
    return "\n".join(lines) + "\n"


def _write_registration(
    destination: Path,
    plan: InstallPlan,
    config: dict,
    chat_template: str,
    adapter_sha256: str,
) -> None:
    destination.mkdir(parents=True, exist_ok=False)
    (destination / "model.yaml").write_text(
        render_model_yaml(plan, config, chat_template), encoding="utf-8"
    )
    manifest = {
        "type": "model",
        "owner": plan.hub_owner,
        "name": plan.hub_name,
        "revision": 1,
        "dependencies": [
            {
                "type": "model",
                "purpose": "baseModel",
                "modelKeys": [plan.concrete_model_key],
                "sources": [
                    {
                        "type": "huggingface",
                        "user": plan.publisher,
                        "repo": plan.model_name,
                    }
                ],
            }
        ],
        "tags": ["local", "mlx", "fine-tuned"],
    }
    (destination / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    readme = (
        f"# {plan.model_name}\n\n"
        "Locally fused MLX model installed by finetune-lora.\n\n"
        f"- Concrete model: `{plan.concrete_model_key}`\n"
        f"- Base model: `{plan.base_model}`\n"
        f"- Adapter: `{plan.adapter}`\n"
        f"- Adapter SHA-256: `{adapter_sha256}`\n"
    )
    (destination / "README.md").write_text(readme, encoding="utf-8")


def _write_user_model_defaults(
    destination: Path,
    chat_template: str,
    existing: Path | None = None,
) -> None:
    """Keep LM Studio's per-model override from shadowing Gemma reasoning parsing."""
    if existing is not None and existing.is_file():
        defaults = _json_file(existing)
    else:
        defaults = {"preset": "", "operation": {"fields": []}, "load": {"fields": []}}

    operation = defaults.get("operation")
    if not isinstance(operation, dict):
        raise TypeError(f"Expected an operation object in LM Studio defaults: {existing}")
    existing_fields = operation.get("fields", [])
    if not isinstance(existing_fields, list) or not all(
        isinstance(field, dict) for field in existing_fields
    ):
        raise ValueError(f"Expected an operation fields array in LM Studio defaults: {existing}")

    managed_keys = {
        "llm.prediction.reasoning.parsing",
        "llm.prediction.promptTemplate",
    }
    fields: list[dict] = [
        field for field in existing_fields if field.get("key") not in managed_keys
    ]
    has_reasoning = "<|channel>thought" in chat_template and "<channel|>" in chat_template
    if has_reasoning:
        fields.insert(
            0,
            {
                "key": "llm.prediction.reasoning.parsing",
                "value": {
                    "enabled": True,
                    "startString": "<|channel>thought",
                    "endString": "<channel|>",
                },
            }
        )
    if chat_template:
        fields.insert(
            1 if has_reasoning else 0,
            {
                "key": "llm.prediction.promptTemplate",
                "value": {
                    "type": "jinja",
                    "jinjaPromptTemplate": {"template": chat_template},
                    "stopStrings": [],
                },
            }
        )
    operation["fields"] = fields
    defaults["operation"] = operation
    defaults.setdefault("preset", "")
    defaults.setdefault("load", {"fields": []})
    destination.write_text(
        json.dumps(defaults, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def _write_model_provenance(path: Path, plan: InstallPlan, adapter_sha256: str) -> None:
    provenance = {
        "schema_version": 1,
        "installed_at": datetime.now(UTC).isoformat(),
        "model_name": plan.model_name,
        "concrete_model_key": plan.concrete_model_key,
        "hub_model_id": plan.hub_model_id,
        "base_model": str(plan.base_model),
        "adapter": str(plan.adapter),
        "adapter_sha256": adapter_sha256,
    }
    (path / "eof_nnl_install.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (path / "README.md").write_text(
        f"# {plan.model_name}\n\n"
        "This is a local MLX model with fused LoRA weights. The base model was not modified.\n",
        encoding="utf-8",
    )


def install_fused_model(
    plan: InstallPlan,
    *,
    fuse_executable: str | Path | None = None,
    run_fuse: FuseRunner = _run_fuse,
    replace: bool = False,
) -> InstallResult:
    _validate_inputs(plan, replace=replace)
    executable = _find_fuse_executable(fuse_executable)
    adapter_weights = plan.adapter / "adapters.safetensors"
    adapter_sha256 = _sha256(adapter_weights)

    plan.model_path.parent.mkdir(parents=True, exist_ok=True)
    plan.hub_path.parent.mkdir(parents=True, exist_ok=True)
    plan.user_defaults_path.parent.mkdir(parents=True, exist_ok=True)
    suffix = uuid.uuid4().hex
    staged_model = plan.model_path.parent / f".{plan.model_name}.tmp-{suffix}"
    staged_hub = plan.hub_path.parent / f".{plan.hub_name}.tmp-{suffix}"
    staged_defaults = plan.user_defaults_path.parent / f".{plan.model_name}.tmp-{suffix}.json"
    defaults_backup = (
        plan.user_defaults_path.parent / f".{plan.model_name}.backup-{suffix}.json"
    )
    model_backup = plan.model_path.parent / f".{plan.model_name}.backup-{suffix}"
    hub_backup = plan.hub_path.parent / f".{plan.hub_name}.backup-{suffix}"
    model_committed = False
    hub_committed = False
    defaults_committed = False
    model_backed_up = False
    hub_backed_up = False
    defaults_backed_up = False

    command = [
        str(executable),
        "--model",
        str(plan.base_model),
        "--adapter-path",
        str(plan.adapter),
        "--save-path",
        str(staged_model),
    ]
    try:
        run_fuse(command)
        if not staged_model.is_dir():
            raise RuntimeError(f"MLX fuse did not create its output directory: {staged_model}")
        _restore_missing_base_weights(plan.base_model, staged_model)
        chat_template = _copy_model_metadata(plan.base_model, staged_model)
        _validate_fused_model(staged_model, base_model=plan.base_model)
        config = _json_file(staged_model / "config.json")
        _write_model_provenance(staged_model, plan, adapter_sha256)
        _write_registration(staged_hub, plan, config, chat_template, adapter_sha256)
        _write_user_model_defaults(
            staged_defaults,
            chat_template,
            existing=plan.user_defaults_path,
        )

        if not replace:
            _ensure_destinations_available(plan)
        if plan.model_path.exists():
            os.replace(plan.model_path, model_backup)
            model_backed_up = True
        os.replace(staged_model, plan.model_path)
        model_committed = True
        if plan.hub_path.exists():
            os.replace(plan.hub_path, hub_backup)
            hub_backed_up = True
        os.replace(staged_hub, plan.hub_path)
        hub_committed = True
        if plan.user_defaults_path.exists():
            os.replace(plan.user_defaults_path, defaults_backup)
            defaults_backed_up = True
        os.replace(staged_defaults, plan.user_defaults_path)
        defaults_committed = True
        if defaults_backed_up:
            defaults_backup.unlink(missing_ok=True)
            defaults_backed_up = False
        if model_backed_up:
            shutil.rmtree(model_backup, ignore_errors=True)
            model_backed_up = False
        if hub_backed_up:
            shutil.rmtree(hub_backup, ignore_errors=True)
            hub_backed_up = False
    except BaseException:
        if defaults_committed and plan.user_defaults_path.exists():
            plan.user_defaults_path.unlink()
        if defaults_backed_up and defaults_backup.exists():
            os.replace(defaults_backup, plan.user_defaults_path)
        if hub_committed and plan.hub_path.exists():
            shutil.rmtree(plan.hub_path)
        if hub_backed_up and hub_backup.exists():
            os.replace(hub_backup, plan.hub_path)
        if model_committed and plan.model_path.exists():
            shutil.rmtree(plan.model_path)
        if model_backed_up and model_backup.exists():
            os.replace(model_backup, plan.model_path)
        if staged_model.exists():
            shutil.rmtree(staged_model)
        if staged_hub.exists():
            shutil.rmtree(staged_hub)
        if staged_defaults.exists():
            staged_defaults.unlink()
        if defaults_backup.exists():
            defaults_backup.unlink()
        if model_backup.exists():
            shutil.rmtree(model_backup)
        if hub_backup.exists():
            shutil.rmtree(hub_backup)
        raise

    return InstallResult(plan=plan, adapter_sha256=adapter_sha256)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fuse an MLX LoRA into a new model and register it with LM Studio."
    )
    parser.add_argument(
        "--config",
        required=True,
        help="Project TOML config; adapter and base model fall back to config values",
    )
    parser.add_argument(
        "--adapter",
        help="MLX adapter directory; overrides training.output_dir from config",
    )
    parser.add_argument(
        "--base-model",
        help="Pristine MLX base model; defaults to adapter/train_setup.json:model",
    )
    parser.add_argument(
        "--lmstudio-root",
        help="LM Studio data root overriding deployment.lmstudio_root",
    )
    parser.add_argument(
        "--name",
        help=f"New model name; the {MODEL_PREFIX}- prefix is added automatically",
    )
    parser.add_argument("--publisher")
    parser.add_argument("--hub-owner")
    parser.add_argument("--fuse-executable", help="Path to mlx_lm.fuse")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print destinations without fusing or writing",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help=(
            "Transactionally replace an existing model and hub entry after the "
            "new fused model passes validation"
        ),
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config_path = Path(args.config).expanduser()
    config = load_config(config_path)
    deployment = config.get("deployment", {})
    adapter_path = resolve_adapter(args.adapter, config, config_path)
    lmstudio_root = (
        args.lmstudio_root
        or os.getenv("LMSTUDIO_ROOT")
        or deployment.get("lmstudio_root")
    )
    if not lmstudio_root:
        raise ValueError(
            "LM Studio root is missing; pass --lmstudio-root, set LMSTUDIO_ROOT, "
            "or set deployment.lmstudio_root"
        )
    plan = build_plan(
        adapter=adapter_path,
        base_model=args.base_model,
        lmstudio_root=lmstudio_root,
        model_name=args.name or deployment.get("model_name"),
        publisher=args.publisher or deployment.get("publisher", DEFAULT_PUBLISHER),
        hub_owner=args.hub_owner or deployment.get("hub_owner", DEFAULT_HUB_OWNER),
        config=config,
    )
    if args.dry_run:
        _validate_inputs(plan, replace=args.replace)
        print(
            json.dumps(
                {
                    "base_model": str(plan.base_model),
                    "adapter": str(plan.adapter),
                    "model_path": str(plan.model_path),
                    "hub_path": str(plan.hub_path),
                    "user_defaults_path": str(plan.user_defaults_path),
                    "concrete_model_key": plan.concrete_model_key,
                    "hub_model_id": plan.hub_model_id,
                },
                indent=2,
            )
        )
        return

    result = install_fused_model(
        plan,
        fuse_executable=args.fuse_executable,
        replace=args.replace,
    )
    action = "Updated" if args.replace else "Installed"
    print(f"{action} fused model: {result.plan.model_path}")
    print(f"Registered LM Studio hub model: {result.plan.hub_path}")
    print(f"Installed LM Studio model defaults: {result.plan.user_defaults_path}")
    print(f"LM Studio model ID: {result.plan.hub_model_id}")
    print(f"Concrete model key: {result.plan.concrete_model_key}")
    print(f"Adapter SHA-256: {result.adapter_sha256}")
    print("Reload LM Studio's model list before loading the new model.")


if __name__ == "__main__":
    main()
