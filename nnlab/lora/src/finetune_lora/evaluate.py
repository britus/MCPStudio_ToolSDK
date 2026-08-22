from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

from .config import load_config, model_source, nested, resolve_path
from .dataset import CompletionCollator, CompletionDataset, fold_system_messages
from .modeling import detect_model_backend, load_model, load_tokenizer


def _move(batch: dict[str, Any], device: str) -> dict[str, Any]:
    return {key: value.to(device) for key, value in batch.items()}


def _prompt_checks(
    model: Any,
    tokenizer: Any,
    path: Path,
    device: str,
    max_total_new: int,
) -> list[dict[str, Any]]:
    import torch

    if not path.exists():
        return []
    checks: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        items = [json.loads(line) for line in handle if line.strip()]
    for item in items:
        prompt = fold_system_messages(item["prompt"])
        text = tokenizer.apply_chat_template(prompt, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(text, return_tensors="pt", add_special_tokens=False)
        inputs = _move(inputs, device)
        with torch.inference_mode():
            output = model.generate(
                **inputs,
                max_new_tokens=max_total_new,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id,
            )
        generated_ids = output[0, inputs["input_ids"].shape[1] :]
        generated = tokenizer.decode(
            generated_ids,
            skip_special_tokens=True,
        )
        eos_value = getattr(
            getattr(model, "generation_config", None),
            "eos_token_id",
            tokenizer.eos_token_id,
        )
        eos_ids = (
            set(eos_value)
            if isinstance(eos_value, (list, tuple, set))
            else {eos_value}
        )
        generated_token_ids = generated_ids.tolist()
        finish_reason = (
            "stop"
            if generated_token_ids and generated_token_ids[-1] in eos_ids
            else "length"
        )
        truncated = finish_reason == "length"
        required = item.get("must_contain", [])
        forbidden = item.get("must_not_contain", [])
        scored = bool(required or forbidden)
        passed = scored and not truncated and all(
            value in generated for value in required
        ) and all(
            value not in generated for value in forbidden
        )
        checks.append(
            {
                "id": item.get("id", f"check-{len(checks) + 1}"),
                "passed": passed if scored else None,
                "scored": scored,
                "must_contain": required,
                "must_not_contain": forbidden,
                "output": generated,
                "generation_tokens": len(generated_token_ids),
                "finish_reason": finish_reason,
                "truncated": truncated,
            }
        )
    return checks


def _evaluate_transformers(
    config_path: str,
    adapter: str | None,
    prompts: str | None,
) -> dict[str, Any]:
    import torch
    from peft import PeftModel
    from torch.utils.data import DataLoader

    config = load_config(config_path)
    model_id = model_source(config)
    revision = str(nested(config, "model", "revision", "main"))
    trust_remote_code = bool(nested(config, "model", "trust_remote_code", False))
    tokenizer = load_tokenizer(
        model_id,
        revision,
        trust_remote_code,
        local_files_only=True,
    )
    model, runtime = load_model(
        model_id,
        revision=revision,
        trust_remote_code=trust_remote_code,
        qlora=False,
        local_files_only=True,
    )
    if adapter:
        model = PeftModel.from_pretrained(model, resolve_path(adapter))
    if runtime.device != "cpu":
        model.to(runtime.device)
    model.eval()

    validation_path = resolve_path(nested(config, "data", "validation_file"))
    dataset = CompletionDataset(
        validation_path,
        tokenizer,
        int(nested(config, "data", "max_seq_length", 8192)),
    )
    loader = DataLoader(
        dataset,
        batch_size=int(nested(config, "training", "eval_batch_size", 1)),
        collate_fn=CompletionCollator(tokenizer),
    )
    weighted_loss = 0.0
    predicted_tokens = 0
    with torch.inference_mode():
        for batch in loader:
            batch = _move(batch, runtime.device)
            token_count = int((batch["labels"] != -100).sum().item())
            output = model(**batch)
            weighted_loss += float(output.loss.item()) * token_count
            predicted_tokens += token_count
    loss = weighted_loss / max(predicted_tokens, 1)
    checks = (
        _prompt_checks(
            model,
            tokenizer,
            resolve_path(prompts),
            runtime.device,
            int(
                nested(
                    config,
                    "inference",
                    "max_total_new_tokens",
                    nested(config, "inference", "max_new_tokens", 1024),
                )
            ),
        )
        if prompts
        else []
    )
    return {
        "base_model": model_id,
        "adapter": str(resolve_path(adapter)) if adapter else None,
        "validation_loss": loss,
        "perplexity": math.exp(min(loss, 20)),
        "predicted_tokens": predicted_tokens,
        "prompt_checks": checks,
        "prompt_pass_rate": _prompt_pass_rate(checks),
    }


def _prompt_pass_rate(checks: list[dict[str, Any]]) -> float | None:
    scored = [check for check in checks if check.get("scored") is True]
    if not scored:
        return None
    return sum(check.get("passed") is True for check in scored) / len(scored)


def evaluate(config_path: str, adapter: str | None, prompts: str | None) -> dict[str, Any]:
    config = load_config(config_path)
    model_id = model_source(config)
    backend = detect_model_backend(
        model_id,
        str(nested(config, "training", "backend", "auto")),
    )
    if backend == "mlx":
        from .mlx_backend import evaluate_mlx

        return evaluate_mlx(config_path, adapter, prompts)
    return _evaluate_transformers(config_path, adapter, prompts)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate a base model or trained adapter")
    parser.add_argument(
        "--config",
        required=True,
        help="Project TOML containing verification defaults",
    )
    parser.add_argument("--adapter", help="Adapter path overriding verification.adapter")
    parser.add_argument(
        "--base-model",
        action="store_true",
        help="Evaluate the configured base model without an adapter",
    )
    parser.add_argument("--prompts", help="JSONL prompt suite overriding verification.prompts_file")
    parser.add_argument("--output", help="Report path overriding verification.output_file")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = load_config(args.config)
    adapter = None if args.base_model else (
        args.adapter or nested(config, "verification", "adapter")
    )
    prompts = args.prompts or nested(config, "verification", "prompts_file")
    output_value = args.output or nested(config, "verification", "output_file")
    if not adapter and not args.base_model:
        raise ValueError(
            "Verification adapter is missing; pass --adapter or set "
            "verification.adapter"
        )
    if not prompts:
        raise ValueError(
            "Verification prompts are missing; pass --prompts or set "
            "verification.prompts_file"
        )
    if not output_value:
        raise ValueError(
            "Verification output is missing; pass --output or set "
            "verification.output_file"
        )
    prompt_path = resolve_path(prompts)
    if not prompt_path.is_file():
        raise FileNotFoundError(f"Verification prompt suite not found: {prompt_path}")
    result = evaluate(args.config, adapter, prompts)
    output = resolve_path(output_value)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"Evaluation written to {output}")
    try:
        report_path = str(output.relative_to(Path.cwd().resolve()))
    except ValueError:
        report_path = str(output)
    print(
        "FINETUNE_RESULT_JSON="
        + json.dumps(
            {
                "reportPath": report_path,
                "adapter": result.get("adapter"),
                "promptCount": len(result.get("prompt_checks", [])),
                "promptPassRate": result.get("prompt_pass_rate"),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
