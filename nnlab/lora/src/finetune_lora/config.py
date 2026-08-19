from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - only reached on unsupported Python
    tomllib = None  # type: ignore[assignment]


def load_config(path: str | Path) -> dict[str, Any]:
    if tomllib is None:
        raise RuntimeError("Python 3.11 or newer is required (tomllib is unavailable).")
    config_path = Path(path).expanduser().resolve()
    with config_path.open("rb") as handle:
        config = tomllib.load(handle)
    config["_config_path"] = str(config_path)
    return config


def resolve_path(value: str | Path, base: str | Path | None = None) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path.resolve()
    root = Path(base).resolve() if base else Path.cwd()
    return (root / path).resolve()


def nested(config: dict[str, Any], section: str, key: str, default: Any = None) -> Any:
    return config.get(section, {}).get(key, default)


def model_source(config: dict[str, Any]) -> str:
    source = str(nested(config, "model", "id"))
    if not bool(nested(config, "model", "local_files_only", True)):
        raise ValueError(
            "This project is configured for local models only; set model.local_files_only=true."
        )
    path = resolve_path(source)
    if not path.is_dir():
        raise FileNotFoundError(
            f"Local trainable model directory not found: {path}. "
            "A GGUF file can be used through LM Studio for RAG, but LoRA training requires "
            "a local Transformers/Safetensors model directory."
        )
    return str(path)
