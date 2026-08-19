from __future__ import annotations

import json
from datetime import datetime, timezone
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
    prompts_file = str(nested(config, "verification", "prompts_file", "")).strip()
    verification_output = str(
        nested(config, "verification", "output_file", "")
    ).strip()
    missing = [
        name
        for name, value in (
            ("merge.master", master),
            ("merge.output", merge_output),
            ("verification.prompts_file", prompts_file),
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
    generated_run_name = run_name or datetime.now(timezone.utc).strftime(
        "run-%Y%m%dT%H%M%S%fZ"
    )
    run_directory = output_root / generated_run_name
    run_directory.mkdir(parents=True, exist_ok=False)
    output = run_directory / "verification_input.json"

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
        },
    }
    output.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return output
