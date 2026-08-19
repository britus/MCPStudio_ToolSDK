from __future__ import annotations

import argparse
from pathlib import Path

from .config import load_config, model_source, nested, resolve_path
from .modeling import load_tokenizer


def merge(config_path: str, adapter: str, output: str, dtype_name: str) -> Path:
    import torch
    import transformers
    from peft import PeftModel
    from transformers import AutoModelForCausalLM

    config = load_config(config_path)
    model_id = model_source(config)
    revision = str(nested(config, "model", "revision", "main"))
    trust_remote_code = bool(nested(config, "model", "trust_remote_code", False))
    dtype = getattr(torch, dtype_name)
    model_kwargs = {
        "revision": revision,
        "trust_remote_code": trust_remote_code,
        "low_cpu_mem_usage": True,
        "local_files_only": True,
    }
    dtype_key = "dtype" if int(transformers.__version__.split(".", 1)[0]) >= 5 else "torch_dtype"
    model_kwargs[dtype_key] = dtype
    model = AutoModelForCausalLM.from_pretrained(model_id, **model_kwargs)
    model = PeftModel.from_pretrained(model, resolve_path(adapter))
    merged = model.merge_and_unload(safe_merge=True)
    output_path = resolve_path(output)
    output_path.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(output_path, safe_serialization=True, max_shard_size="4GB")
    tokenizer = load_tokenizer(
        model_id,
        revision,
        trust_remote_code,
        local_files_only=True,
    )
    tokenizer.save_pretrained(output_path)
    return output_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Merge a LoRA adapter into its base model")
    parser.add_argument("--config", required=True)
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--dtype",
        choices=("float16", "bfloat16", "float32"),
        default="float16",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    output = merge(args.config, args.adapter, args.output, args.dtype)
    print(f"Merged model written to {output}")


if __name__ == "__main__":
    main()
