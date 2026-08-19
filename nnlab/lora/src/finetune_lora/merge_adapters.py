from __future__ import annotations

import argparse
import hashlib
import json
import os
import uuid
from pathlib import Path
from typing import Any

from .config import load_config, nested, resolve_path

ADAPTER_CONFIG = "adapter_config.json"
ADAPTER_WEIGHTS = "adapters.safetensors"
MERGE_REPORT = "merge_report.json"


def _json_file(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot read valid JSON from {path}: {error}") from error
    if not isinstance(value, dict):
        raise TypeError(f"Expected a JSON object in {path}")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_adapter_config(adapter: Path) -> dict[str, Any]:
    config_path = adapter / ADAPTER_CONFIG
    if not config_path.is_file():
        raise FileNotFoundError(f"Adapter config missing: {config_path}")
    return _json_file(config_path)


def _validate_adapter_dir(adapter: Path) -> None:
    if not adapter.is_dir():
        raise FileNotFoundError(f"Adapter directory not found: {adapter}")
    if not (adapter / ADAPTER_WEIGHTS).is_file():
        raise FileNotFoundError(f"Adapter weights missing: {adapter / ADAPTER_WEIGHTS}")
    _load_adapter_config(adapter)


def _lora_parameters(config: dict[str, Any], adapter: Path) -> dict[str, Any]:
    parameters = config.get("lora_parameters")
    if not isinstance(parameters, dict):
        raise TypeError(f"{adapter / ADAPTER_CONFIG} has no lora_parameters object")
    return parameters


def _validate_compatibility(
    adapters: list[Path],
    configs: list[dict[str, Any]],
) -> tuple[int, float, int]:
    """Ensure every adapter targets the same base model with the same LoRA layout."""
    reference = adapters[0]
    reference_params = _lora_parameters(configs[0], reference)
    rank = int(reference_params.get("rank", 0))
    scale = float(reference_params.get("scale", 0.0))
    num_layers = int(configs[0].get("num_layers", 0))
    if rank <= 0 or num_layers <= 0:
        raise ValueError(f"{reference / ADAPTER_CONFIG} has invalid rank or num_layers")
    if str(configs[0].get("fine_tune_type", "lora")) != "lora":
        raise ValueError(f"Only fine_tune_type 'lora' can be merged: {reference}")

    setup_path = reference / "train_setup.json"
    reference_model = _json_file(setup_path).get("model") if setup_path.is_file() else None

    for adapter, config in zip(adapters[1:], configs[1:], strict=True):
        if str(config.get("fine_tune_type", "lora")) != "lora":
            raise ValueError(f"Only fine_tune_type 'lora' can be merged: {adapter}")
        parameters = _lora_parameters(config, adapter)
        if int(parameters.get("rank", 0)) != rank:
            raise ValueError(
                f"LoRA rank mismatch: {adapter} uses rank {parameters.get('rank')}, expected {rank}"
            )
        if float(parameters.get("scale", 0.0)) != scale:
            raise ValueError(
                f"LoRA scale mismatch: {adapter} uses scale "
                f"{parameters.get('scale')}, expected {scale}"
            )
        if int(config.get("num_layers", 0)) != num_layers:
            raise ValueError(
                f"LoRA layer count mismatch: {adapter} uses num_layers "
                f"{config.get('num_layers')}, expected {num_layers}"
            )
        setup_path = adapter / "train_setup.json"
        if reference_model and setup_path.is_file():
            model = _json_file(setup_path).get("model")
            if model != reference_model:
                raise ValueError(
                    f"Base model mismatch: {adapter} was trained on {model}, "
                    f"expected {reference_model}"
                )
    return rank, scale, num_layers


def _rank_axis(key: str, shape: list[int], rank: int) -> int:
    """Locate the LoRA rank axis; it is the only axis shared by the a/b pair."""
    axes = [axis for axis, size in enumerate(shape) if size == rank]
    if len(axes) != 1:
        raise ValueError(
            f"Cannot determine the rank axis of tensor {key!r} with shape {shape} for rank {rank}"
        )
    return axes[0]


def merge_tensors(
    tensors_per_adapter: list[dict[str, Any]],
    weights: list[float],
    rank: int,
) -> dict[str, Any]:
    """Concatenate LoRA factors along the rank axis.

    For every target module the merged low-rank update is the weighted sum of the
    individual updates. With the A and B factors concatenated along the rank
    axis, A_cat @ B_cat equals the sum of A_i @ B_i, so the merge is exact: the
    combined adapter reproduces the weighted sum of all input adapters without
    any low-rank re-approximation. Per-adapter weights are folded into lora_b
    because the update is linear in lora_b for both the dense (LoRALinear) and
    the expert (LoRASwitchLinear) layout.
    """
    import mlx.core as mx

    reference_keys = set(tensors_per_adapter[0])
    for tensors in tensors_per_adapter[1:]:
        if set(tensors) != reference_keys:
            missing = sorted(reference_keys - set(tensors))[:5]
            extra = sorted(set(tensors) - reference_keys)[:5]
            raise ValueError(
                f"Adapter tensor keys differ; missing: {missing or '-'}, unexpected: {extra or '-'}"
            )

    merged: dict[str, Any] = {}
    for key in sorted(reference_keys):
        reference = tensors_per_adapter[0][key]
        shape = list(reference.shape)
        for tensors in tensors_per_adapter[1:]:
            if list(tensors[key].shape) != shape:
                raise ValueError(
                    f"Shape mismatch for tensor {key!r}: {tensors[key].shape} vs {shape}"
                )
            if tensors[key].dtype != reference.dtype:
                raise ValueError(f"Dtype mismatch for tensor {key!r}")
        axis = _rank_axis(key, shape, rank)
        if key.endswith(".lora_a"):
            merged[key] = mx.concatenate(
                [tensors[key] for tensors in tensors_per_adapter], axis=axis
            )
        elif key.endswith(".lora_b"):
            merged[key] = mx.concatenate(
                [
                    tensors[key] * weight
                    for tensors, weight in zip(tensors_per_adapter, weights, strict=True)
                ],
                axis=axis,
            )
        else:
            raise ValueError(f"Unsupported adapter tensor {key!r}; expected lora_a/lora_b")
    return merged


def refresh_merged_tensors(
    merged_master: dict[str, Any],
    replacements: list[dict[str, Any]],
    weights: list[float],
    previous_weights: list[float],
    base_rank: int,
    preserved_components: int,
) -> dict[str, Any]:
    """Replace the trailing components of an exact rank-concatenated adapter.

    The current master already contains weighted rank chunks. Leading chunks are
    retained and, when possible, rescaled from their previous weight to the new
    weight. Trailing chunks are replaced with newly trained compatible adapters.
    """
    import mlx.core as mx

    component_count = preserved_components + len(replacements)
    if len(weights) != component_count or len(previous_weights) != component_count:
        raise ValueError("Refresh weights do not match the merged component count")

    reference_keys = set(merged_master)
    for tensors in replacements:
        if set(tensors) != reference_keys:
            missing = sorted(reference_keys - set(tensors))[:5]
            extra = sorted(set(tensors) - reference_keys)[:5]
            raise ValueError(
                f"Adapter tensor keys differ; missing: {missing or '-'}, unexpected: {extra or '-'}"
            )

    def rank_slice(tensor: Any, axis: int, start: int, end: int) -> Any:
        indexes = [slice(None)] * tensor.ndim
        indexes[axis] = slice(start, end)
        return tensor[tuple(indexes)]

    def refresh_rank_axis(master_shape: list[int], component_shape: list[int]) -> int:
        axes = [
            axis
            for axis, (master_size, component_size) in enumerate(
                zip(master_shape, component_shape, strict=True)
            )
            if master_size == component_size * component_count
            and all(
                master_shape[other] == component_shape[other]
                for other in range(len(master_shape))
                if other != axis
            )
        ]
        if len(axes) != 1:
            raise ValueError(
                "Cannot determine refresh rank axis for merged shape "
                f"{master_shape} and component shape {component_shape}"
            )
        return axes[0]

    refreshed: dict[str, Any] = {}
    for key in sorted(reference_keys):
        master_tensor = merged_master[key]
        master_shape = list(master_tensor.shape)
        expected_shape = list(replacements[0][key].shape)
        axis = refresh_rank_axis(master_shape, expected_shape)
        for tensors in replacements:
            if list(tensors[key].shape) != expected_shape:
                raise ValueError(
                    f"Shape mismatch for tensor {key!r}: {tensors[key].shape} "
                    f"vs expected component shape {expected_shape}"
                )
            if tensors[key].dtype != master_tensor.dtype:
                raise ValueError(f"Dtype mismatch for tensor {key!r}")

        preserved: list[Any] = []
        for component in range(preserved_components):
            chunk = rank_slice(
                master_tensor,
                axis,
                component * base_rank,
                (component + 1) * base_rank,
            )
            if key.endswith(".lora_b"):
                previous_weight = previous_weights[component]
                new_weight = weights[component]
                if previous_weight == 0.0:
                    if new_weight != 0.0:
                        raise ValueError(
                            "Cannot restore a preserved component whose previous "
                            "merge weight was zero"
                        )
                    chunk = chunk * 0.0
                else:
                    chunk = chunk * (new_weight / previous_weight)
            preserved.append(chunk)

        if key.endswith(".lora_a"):
            new_chunks = [tensors[key] for tensors in replacements]
        elif key.endswith(".lora_b"):
            new_chunks = [
                tensors[key] * weights[preserved_components + index]
                for index, tensors in enumerate(replacements)
            ]
        else:
            raise ValueError(f"Unsupported adapter tensor {key!r}; expected lora_a/lora_b")
        refreshed[key] = mx.concatenate(preserved + new_chunks, axis=axis)
    return refreshed


def _refresh_plan(
    master: Path,
    master_config: dict[str, Any],
    replacements: list[Path],
    replacement_configs: list[dict[str, Any]],
) -> tuple[dict[str, Any], int, float, int, int]:
    """Validate provenance for refreshing an already merged master."""
    report_path = master / MERGE_REPORT
    if not report_path.is_file():
        raise ValueError(f"LoRA rank mismatch and no merge provenance is available: {report_path}")
    report = _json_file(report_path)
    if report.get("method") not in {
        "lora-rank-concatenation",
        "lora-component-refresh",
    }:
        raise ValueError(f"Unsupported merge provenance method in {report_path}")
    current_hash = _sha256(master / ADAPTER_WEIGHTS)
    if report.get("merged_sha256") != current_hash:
        raise ValueError("Merged master weights do not match their merge provenance")

    base_rank = int(report.get("base_rank", 0))
    merged_rank = int(_lora_parameters(master_config, master).get("rank", 0))
    component_count = int(report.get("merged_rank", 0)) // base_rank if base_rank else 0
    reported_adapters = report.get("adapters")
    previous_weights = report.get("weights")
    if (
        base_rank <= 0
        or merged_rank != base_rank * component_count
        or not isinstance(reported_adapters, list)
        or len(reported_adapters) != component_count
        or not isinstance(previous_weights, list)
        or len(previous_weights) != component_count
    ):
        raise ValueError(f"Invalid merged adapter provenance in {report_path}")
    preserved_components = component_count - len(replacements)
    if preserved_components <= 0:
        raise ValueError("Refreshing a merged master must preserve at least one leading component")

    scale = float(_lora_parameters(master_config, master).get("scale", 0.0))
    num_layers = int(master_config.get("num_layers", 0))
    setup_path = master / "train_setup.json"
    reference_model = _json_file(setup_path).get("model") if setup_path.is_file() else None
    for adapter, config in zip(replacements, replacement_configs, strict=True):
        parameters = _lora_parameters(config, adapter)
        if str(config.get("fine_tune_type", "lora")) != "lora":
            raise ValueError(f"Only fine_tune_type 'lora' can be merged: {adapter}")
        if int(parameters.get("rank", 0)) != base_rank:
            raise ValueError(
                f"LoRA rank mismatch: {adapter} uses rank "
                f"{parameters.get('rank')}, expected component rank {base_rank}"
            )
        if float(parameters.get("scale", 0.0)) != scale:
            raise ValueError(
                f"LoRA scale mismatch: {adapter} uses scale "
                f"{parameters.get('scale')}, expected {scale}"
            )
        if int(config.get("num_layers", 0)) != num_layers:
            raise ValueError(
                f"LoRA layer count mismatch: {adapter} uses num_layers "
                f"{config.get('num_layers')}, expected {num_layers}"
            )
        adapter_setup = adapter / "train_setup.json"
        if reference_model and adapter_setup.is_file():
            model = _json_file(adapter_setup).get("model")
            if model != reference_model:
                raise ValueError(
                    f"Base model mismatch: {adapter} was trained on {model}, "
                    f"expected {reference_model}"
                )
    return report, base_rank, scale, num_layers, preserved_components


def merge_adapters(
    master: str | Path,
    adapters: list[str | Path],
    weights: list[float] | None,
    output: str | Path | None,
    in_place: bool = False,
    force: bool = False,
) -> dict[str, Any]:
    """Merge MLX LoRA adapters into the master adapter and return a merge report."""
    import mlx.core as mx

    master_path = resolve_path(master)
    adapter_paths = [master_path, *[resolve_path(adapter) for adapter in adapters]]
    if len(adapter_paths) < 2:
        raise ValueError("Provide at least one adapter in addition to the master")
    for adapter in adapter_paths:
        _validate_adapter_dir(adapter)

    if weights is None:
        weights = [1.0] * len(adapter_paths)
    if len(weights) != len(adapter_paths):
        raise ValueError(f"Expected {len(adapter_paths)} weights, received {len(weights)}")
    weights = [float(weight) for weight in weights]

    configs = [_load_adapter_config(adapter) for adapter in adapter_paths]
    master_rank = int(_lora_parameters(configs[0], master_path).get("rank", 0))
    replacement_ranks = [
        int(_lora_parameters(config, adapter).get("rank", 0))
        for adapter, config in zip(adapter_paths[1:], configs[1:], strict=True)
    ]
    refresh_report: dict[str, Any] | None = None
    preserved_components = 0
    if replacement_ranks and all(rank == master_rank for rank in replacement_ranks):
        rank, scale, num_layers = _validate_compatibility(adapter_paths, configs)
    else:
        refresh_report, rank, scale, num_layers, preserved_components = _refresh_plan(
            master_path,
            configs[0],
            adapter_paths[1:],
            configs[1:],
        )

    if in_place:
        output_path = master_path
    else:
        if output is None:
            raise ValueError("Provide --output or use --in-place")
        output_path = resolve_path(output)
        if output_path in adapter_paths:
            raise ValueError(
                "Output directory matches an input adapter; use --in-place for the master"
            )
        if output_path.exists() and any(output_path.iterdir()) and not force:
            raise FileExistsError(
                f"Output directory is not empty: {output_path}. Use --force to overwrite."
            )
        output_path.mkdir(parents=True, exist_ok=True)

    # Capture source hashes before the merge so an in-place report still records
    # the original master weights.
    source_hashes = {str(adapter): _sha256(adapter / ADAPTER_WEIGHTS) for adapter in adapter_paths}
    tensors_per_adapter = [mx.load(str(adapter / ADAPTER_WEIGHTS)) for adapter in adapter_paths]
    if refresh_report is None:
        merged = merge_tensors(tensors_per_adapter, weights, rank)
        merged_rank = rank * len(adapter_paths)
        report_adapters = [str(adapter) for adapter in adapter_paths]
        method = "lora-rank-concatenation"
        refreshed_from_sha256 = None
    else:
        previous_weights = [float(value) for value in refresh_report["weights"]]
        merged = refresh_merged_tensors(
            tensors_per_adapter[0],
            tensors_per_adapter[1:],
            weights,
            previous_weights,
            rank,
            preserved_components,
        )
        merged_rank = int(refresh_report["merged_rank"])
        report_adapters = [
            *[str(value) for value in refresh_report["adapters"][:preserved_components]],
            *[str(adapter) for adapter in adapter_paths[1:]],
        ]
        previous_hashes = refresh_report.get("sources_sha256", {})
        if not isinstance(previous_hashes, dict):
            raise ValueError("Invalid source hashes in merge provenance")
        source_hashes = {
            **{
                source: str(previous_hashes.get(source, "unknown"))
                for source in report_adapters[:preserved_components]
            },
            **{str(adapter): _sha256(adapter / ADAPTER_WEIGHTS) for adapter in adapter_paths[1:]},
        }
        method = "lora-component-refresh"
        refreshed_from_sha256 = str(refresh_report["merged_sha256"])

    # Persist through staging files so an interrupted merge never leaves a
    # half-written adapters.safetensors behind, especially for --in-place.
    suffix = uuid.uuid4().hex
    staged_weights = output_path / f".adapters.tmp-{suffix}.safetensors"
    staged_config = output_path / f".adapter_config.tmp-{suffix}.json"
    try:
        mx.save_safetensors(str(staged_weights), merged, metadata={"format": "mlx"})
        merged_config = dict(configs[0])
        merged_config["adapter_path"] = str(output_path)
        merged_config["lora_parameters"] = {
            **_lora_parameters(configs[0], master_path),
            "rank": merged_rank,
        }
        staged_config.write_text(
            json.dumps(merged_config, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        # Structural validation of the staged result before publishing it.
        reloaded = mx.load(str(staged_weights))
        if set(reloaded) != set(merged):
            raise RuntimeError("Merged adapter failed the reload key check")
        for key, tensor in merged.items():
            if list(reloaded[key].shape) != list(tensor.shape):
                raise RuntimeError(f"Merged adapter tensor {key!r} changed shape on reload")

        os.replace(staged_weights, output_path / ADAPTER_WEIGHTS)
        os.replace(staged_config, output_path / ADAPTER_CONFIG)
    except BaseException:
        staged_weights.unlink(missing_ok=True)
        staged_config.unlink(missing_ok=True)
        raise

    report = {
        "method": method,
        "master": str(master_path),
        "adapters": report_adapters,
        "weights": weights,
        "base_rank": rank,
        "merged_rank": merged_rank,
        "scale": scale,
        "num_layers": num_layers,
        "tensor_count": len(merged),
        "output": str(output_path),
        "sources_sha256": source_hashes,
        "merged_sha256": _sha256(output_path / ADAPTER_WEIGHTS),
    }
    if refreshed_from_sha256 is not None:
        report["refreshed_from_sha256"] = refreshed_from_sha256
    (output_path / MERGE_REPORT).write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Merge MLX LoRA adapters into the master adapter by concatenating "
            "the LoRA factors along the rank axis. The merged adapter reproduces "
            "the weighted sum of all input adapters. When the master is an "
            "existing provenance-backed merge, compatible trailing components "
            "are refreshed without re-adding previous components."
        )
    )
    parser.add_argument(
        "--config",
        required=True,
        help="Project TOML containing merge defaults",
    )
    parser.add_argument(
        "--master",
        default=None,
        help="Master adapter directory that receives the merge",
    )
    parser.add_argument(
        "--adapters",
        nargs="+",
        default=None,
        help="Additional adapters merged into the master",
    )
    parser.add_argument(
        "--weights",
        nargs="+",
        type=float,
        help="Optional weight per adapter, master first (default: all 1.0)",
    )
    parser.add_argument(
        "--output",
        help="Output directory for the merged adapter (default: none)",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        default=None,
        help="Write the merged adapter back into the master directory",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        default=None,
        help="Allow writing into a non-empty output directory",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = load_config(args.config)
    master = args.master or nested(config, "merge", "master")
    adapters = args.adapters
    if adapters is None:
        adapters = list(nested(config, "merge", "adapters", []))
    weights = args.weights
    if weights is None:
        configured_weights = list(nested(config, "merge", "weights", []))
        weights = configured_weights or None
    output = args.output or nested(config, "merge", "output")
    in_place = (
        args.in_place
        if args.in_place is not None
        else bool(nested(config, "merge", "in_place", False))
    )
    force = (
        args.force
        if args.force is not None
        else bool(nested(config, "merge", "force", False))
    )
    if not master:
        raise ValueError("Merge master is missing; pass --master or set merge.master")
    if not adapters:
        raise ValueError("Merge adapters are missing; pass --adapters or set merge.adapters")
    report = merge_adapters(
        master=master,
        adapters=adapters,
        weights=weights,
        output=output,
        in_place=in_place,
        force=force,
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nMerged adapter written to {report['output']}")
    output_path = Path(report["output"]).resolve()
    try:
        adapter_path = str(output_path.relative_to(Path.cwd().resolve()))
    except ValueError:
        adapter_path = str(output_path)
    merge_report_path = output_path / MERGE_REPORT
    try:
        report_path = str(merge_report_path.relative_to(Path.cwd().resolve()))
    except ValueError:
        report_path = str(merge_report_path)
    print(
        "FINETUNE_RESULT_JSON="
        + json.dumps(
            {
                "adapter": adapter_path,
                "mergeReportPath": report_path,
                "mergedSha256": report["merged_sha256"],
                "method": report["method"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
