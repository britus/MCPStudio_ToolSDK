from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Runtime:
    device: str
    dtype_name: str


def detect_model_backend(model_path: str | Path, requested: str = "auto") -> str:
    if requested not in {"auto", "mlx", "transformers"}:
        raise ValueError("training.backend must be auto, mlx, or transformers")
    if requested != "auto":
        return requested
    config_path = Path(model_path) / "config.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot inspect local model config: {config_path}") from error
    quantization = config.get("quantization_config")
    if isinstance(quantization, dict):
        is_mlx = (
            "quant_method" not in quantization
            and {"bits", "group_size"}.issubset(quantization)
            and quantization.get("mode") in {"affine", "mxfp4"}
        )
        if is_mlx:
            return "mlx"
    return "transformers"


def detect_runtime() -> Runtime:
    import torch

    if torch.cuda.is_available():
        dtype = "bfloat16" if torch.cuda.is_bf16_supported() else "float16"
        return Runtime("cuda", dtype)
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return Runtime("mps", "float16")
    return Runtime("cpu", "float32")


def load_tokenizer(
    model_id: str,
    revision: str = "main",
    trust_remote_code: bool = False,
    local_files_only: bool = True,
) -> Any:
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(
        model_id,
        revision=revision,
        trust_remote_code=trust_remote_code,
        local_files_only=local_files_only,
    )
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    return tokenizer


def load_model(
    model_id: str,
    *,
    revision: str = "main",
    trust_remote_code: bool = False,
    qlora: bool = False,
    local_files_only: bool = True,
) -> tuple[Any, Runtime]:
    import torch
    import transformers
    from transformers import AutoModelForCausalLM

    runtime = detect_runtime()
    if qlora and runtime.device != "cuda":
        raise RuntimeError(
            "QLoRA requires a CUDA GPU and bitsandbytes. On Apple Silicon use regular LoRA "
            "(training.qlora=false); on CPU use a smaller model."
        )
    dtype = getattr(torch, runtime.dtype_name)
    model_kwargs: dict[str, Any] = {
        "revision": revision,
        "trust_remote_code": trust_remote_code,
        "local_files_only": local_files_only,
    }
    dtype_key = "dtype" if int(transformers.__version__.split(".", 1)[0]) >= 5 else "torch_dtype"
    model_kwargs[dtype_key] = dtype
    if qlora:
        from transformers import BitsAndBytesConfig

        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=dtype,
        )
        model_kwargs["device_map"] = {"": 0}
    model = AutoModelForCausalLM.from_pretrained(model_id, **model_kwargs)
    return model, runtime
