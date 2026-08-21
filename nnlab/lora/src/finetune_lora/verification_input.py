from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import load_config, nested, resolve_path

SCHEMA_VERSION = 1
DEFAULT_ACCEPTANCE_CRITERIA = (
    "Execute every held-out prompt and review every generated answer for factual "
    "relevance, required coverage, unsupported claims, cross-context contamination, "
    "prompt leakage and repeated control tokens. Process success or keyword matches "
    "alone are insufficient for PASS."
)
DEFAULT_PROMPT_SYSTEM_MESSAGE = (
    "Answer as a technical documentation assistant. Use only documented facts, "
    "identify the applicable product, module or revision, and state clearly when "
    "the available documentation is insufficient."
)


def _relative_to_project(path: Path, project_root: Path) -> str:
    resolved = path.expanduser().resolve()
    try:
        return str(resolved.relative_to(project_root))
    except ValueError:
        return str(resolved)


def _string_weights(values: list[Any], expected: int) -> list[str]:
    if len(values) != expected:
        return ["1"] * expected
    return [str(value) for value in values]


def _verification_focuses(objective_text: str) -> list[str]:
    release_section = objective_text
    marker = re.search(r"(?im)^release boundaries\s*$", objective_text)
    if marker:
        release_section = objective_text[marker.end() :]
        end = re.search(r"(?im)^expected discovery result\s*$", release_section)
        if end:
            release_section = release_section[: end.start()]

    focuses: list[str] = []
    for raw_line in release_section.splitlines():
        line = raw_line.strip()
        match = re.match(r"^(?:verify|check)\s+(.+?)(?:\s+independently|\s+during verification)?\.?$", line, re.IGNORECASE)
        if not match:
            continue
        focus = match.group(1).strip().rstrip(".")
        if focus and focus.casefold() not in {item.casefold() for item in focuses}:
            focuses.append(focus)
    return focuses


def _objective_scope(objective_path: Path, objective_text: str) -> str:
    match = re.search(r"(?im)^training objective:\s*(.+?)\s*$", objective_text)
    scope_parts = [match.group(1).strip()] if match else []
    for focus_match in re.finditer(r"(?im)^focus on\s+(.+?)\s*$", objective_text):
        focus = focus_match.group(1).strip().rstrip(".")
        if focus and focus.casefold() not in {
            part.casefold() for part in scope_parts
        }:
            scope_parts.append(focus)
    if scope_parts:
        return "; ".join(scope_parts)
    return objective_path.stem.replace("-", " ").replace("_", " ").strip()


def _prompt_id(objective_path: Path, focus: str, index: int) -> str:
    objective_slug = re.sub(r"[^a-z0-9]+", "-", objective_path.stem.casefold()).strip("-")
    focus_slug = re.sub(r"[^a-z0-9]+", "-", focus.casefold()).strip("-")
    return f"{objective_slug or 'objective'}-{focus_slug or f'check-{index}'}"


def _generated_prompt_records(
    objective_path: Path,
    objective_text: str,
) -> list[dict[str, Any]]:
    scope = _objective_scope(objective_path, objective_text)
    focuses = _verification_focuses(objective_text)
    if not focuses:
        focuses = ["the documented scope, key technical behavior and limitations"]
    records: list[dict[str, Any]] = []
    for index, focus in enumerate(focuses, start=1):
        records.append(
            {
                "id": _prompt_id(objective_path, focus, index),
                "prompt": [
                    {
                        "role": "system",
                        "content": (
                            f"{DEFAULT_PROMPT_SYSTEM_MESSAGE} Verification scope: "
                            f"{scope}."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f'Within the verification scope "{scope}", address this '
                            "focus using documented evidence: "
                            f"{focus}. Include exact identifiers and values only when "
                            "supported."
                        ),
                    },
                ],
                "must_contain": [],
                "must_not_contain": [],
                "generated": True,
                "verification_focus": focus,
            }
        )
    return records


def _write_generated_prompts(
    output: Path,
    objective_path: Path,
    objective_text: str,
) -> int:
    records = _generated_prompt_records(objective_path, objective_text)
    output.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in records),
        encoding="utf-8",
    )
    return len(records)


def _run_scoped_output(path_value: str, run_name: str) -> str:
    path = Path(path_value)
    if path.suffix:
        name = f"{path.stem}-{run_name}{path.suffix}"
    else:
        name = f"{path.name}-{run_name}"
    return str(path.with_name(name))


def create_verification_input(
    config_path: str | Path,
    trained_adapter: str | Path,
    objective_file: str | Path,
    *,
    project_root: str | Path | None = None,
    run_name: str | None = None,
) -> Path:
    root = Path(project_root or Path.cwd()).expanduser().resolve()
    config_file = resolve_path(config_path, root)
    config = load_config(config_file)
    objective_path = Path(objective_file).expanduser().resolve()
    if objective_path.suffix.lower() not in {".txt", ".md"}:
        raise ValueError("Training objective must be a UTF-8 .txt or .md file")
    if not objective_path.is_file():
        raise FileNotFoundError(f"Training objective not found: {objective_path}")
    objective_text = objective_path.read_text(encoding="utf-8").strip()
    if not objective_text:
        raise ValueError("Training objective is empty")

    adapter_path = resolve_path(trained_adapter, root)
    if not (adapter_path / "adapters.safetensors").is_file():
        raise FileNotFoundError(
            f"Trained adapter weights not found: {adapter_path / 'adapters.safetensors'}"
        )
    if not (adapter_path / "adapter_config.json").is_file():
        raise FileNotFoundError(
            f"Trained adapter configuration not found: {adapter_path / 'adapter_config.json'}"
        )

    adapter_reference = _relative_to_project(adapter_path, root)
    master = str(nested(config, "merge", "master", "")).strip()
    merge_output = str(nested(config, "merge", "output", "")).strip()
    configured_prompts_file = str(
        nested(config, "verification", "prompts_file", "")
    ).strip()
    verification_output = str(
        nested(config, "verification", "output_file", "")
    ).strip()
    missing = [
        name
        for name, value in (
            ("merge.master", master),
            ("merge.output", merge_output),
            ("verification.output_file", verification_output),
        )
        if not value
    ]
    if missing:
        raise ValueError("Missing verification input settings: " + ", ".join(missing))

    weights = _string_weights(list(nested(config, "merge", "weights", [])), 2)
    output_root = resolve_path(
        nested(config, "verification_input", "output_root", "data/verifications"),
        root,
    )
    generated_run_name = run_name or datetime.now(UTC).strftime(
        "run-%Y%m%dT%H%M%S%fZ"
    )
    if bool(nested(config, "verification_input", "run_scoped_outputs", True)):
        merge_output = _run_scoped_output(merge_output, generated_run_name)
        verification_output = _run_scoped_output(
            verification_output,
            generated_run_name,
        )
    run_directory = output_root / generated_run_name
    run_directory.mkdir(parents=True, exist_ok=False)
    output = run_directory / "verification_input.json"
    auto_generate_prompts = bool(
        nested(config, "verification_input", "auto_generate_prompts", True)
    )
    if auto_generate_prompts:
        prompt_path = run_directory / "eval-prompts.jsonl"
        prompt_count = _write_generated_prompts(
            prompt_path,
            objective_path,
            objective_text,
        )
        prompts_file = _relative_to_project(prompt_path, root)
        prompt_source = "generated"
    else:
        if not configured_prompts_file:
            raise ValueError(
                "verification.prompts_file is required when automatic prompt "
                "generation is disabled"
            )
        prompt_path = resolve_path(configured_prompts_file, root)
        if not prompt_path.is_file():
            raise FileNotFoundError(f"Verification prompts not found: {prompt_path}")
        prompts_file = _relative_to_project(prompt_path, root)
        prompt_count = sum(
            1
            for line in prompt_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        )
        if prompt_count < 1:
            raise ValueError(f"Verification prompts are empty: {prompt_path}")
        prompt_source = "configured"

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "projectRoot": str(root),
        "configPath": _relative_to_project(config_file, root),
        "promptsFile": prompts_file,
        "outputFile": verification_output,
        "subjectContext": objective_text,
        "acceptanceCriteria": str(
            nested(
                config,
                "verification_input",
                "acceptance_criteria",
                DEFAULT_ACCEPTANCE_CRITERIA,
            )
        ).strip(),
        "master": master,
        "adapters": [adapter_reference],
        "weights": weights,
        "output": merge_output,
        "force": False,
        "trainingRun": {
            "objectiveFile": str(objective_path),
            "trainedAdapter": adapter_reference,
            "promptSource": prompt_source,
            "promptCount": prompt_count,
        },
    }
    output.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return output
