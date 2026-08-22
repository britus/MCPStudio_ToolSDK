from __future__ import annotations

import argparse
import json
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .chat import _strip_reasoning
from .config import load_config, model_source, nested, resolve_path
from .dataset import fold_system_messages

DEFAULT_OUTPUT = "artifacts/inference-test-report.json"


def _load_prompt_records(
    path: Path,
    selected_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    if not path.is_file():
        raise FileNotFoundError(f"Inference prompt suite not found: {path}")
    records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"Invalid prompt JSON at {path}:{line_number}: {error.msg}"
                ) from error
            if not isinstance(record, dict):
                raise TypeError(f"Prompt at {path}:{line_number} must be a JSON object")
            prompt_id = str(record.get("id") or f"prompt-{line_number}")
            if prompt_id in seen_ids:
                raise ValueError(f"Duplicate prompt id at {path}:{line_number}: {prompt_id}")
            seen_ids.add(prompt_id)
            messages = record.get("prompt")
            if not isinstance(messages, list) or not messages:
                raise ValueError(
                    f"Prompt at {path}:{line_number} requires a non-empty prompt array"
                )
            record["id"] = prompt_id
            if selected_ids is None or prompt_id in selected_ids:
                records.append(record)
    if selected_ids is not None:
        missing = sorted(selected_ids - {record["id"] for record in records})
        if missing:
            raise ValueError(f"Unknown prompt id(s): {', '.join(missing)}")
    if not records:
        raise ValueError(f"No inference prompts selected from {path}")
    return records


def run_mlx_inference(
    config: dict[str, Any],
    adapter: str | None,
    prompts: Path,
    *,
    selected_ids: set[str] | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    on_result: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    from mlx_lm import load, stream_generate
    from mlx_lm.sample_utils import make_sampler

    configured_backend = str(nested(config, "inference", "backend", "mlx"))
    if configured_backend != "mlx":
        raise ValueError(
            f"Inference test requires inference.backend='mlx', got {configured_backend!r}"
        )
    token_limit = max_tokens
    if token_limit is None:
        token_limit = int(
            nested(
                config,
                "inference",
                "max_total_new_tokens",
                nested(config, "inference", "max_new_tokens", 1024),
            )
        )
    if token_limit <= 0:
        raise ValueError("Inference token limit must be greater than zero")
    sampling_temperature = (
        float(nested(config, "inference", "temperature", 0.15))
        if temperature is None
        else temperature
    )
    if sampling_temperature < 0:
        raise ValueError("Inference temperature cannot be negative")

    prompt_records = _load_prompt_records(prompts, selected_ids)
    model_path = model_source(config)
    adapter_path = str(resolve_path(adapter)) if adapter else None
    if adapter_path is not None and not Path(adapter_path).is_dir():
        raise FileNotFoundError(f"Inference adapter directory not found: {adapter_path}")
    model, tokenizer = load(model_path, adapter_path=adapter_path)
    sampler = make_sampler(temp=sampling_temperature)
    results: list[dict[str, Any]] = []

    for record in prompt_records:
        messages = fold_system_messages(record["prompt"])
        rendered_prompt = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        raw_parts: list[str] = []
        generation_tokens = 0
        finish_reason = "length"
        started = time.perf_counter()
        for response in stream_generate(
            model,
            tokenizer,
            rendered_prompt,
            max_tokens=token_limit,
            sampler=sampler,
        ):
            raw_parts.append(response.text)
            generation_tokens = response.generation_tokens
            if response.finish_reason is not None:
                finish_reason = response.finish_reason
        elapsed_seconds = time.perf_counter() - started
        raw_output = "".join(raw_parts)
        visible_output = _strip_reasoning(raw_output)
        result = {
            "id": record["id"],
            "prompt": record["prompt"],
            "rendered_prompt": rendered_prompt,
            "raw_output": raw_output,
            "output": visible_output,
            "generation_tokens": generation_tokens,
            "finish_reason": finish_reason,
            "truncated": finish_reason != "stop",
            "raw_characters": len(raw_output),
            "output_characters": len(visible_output),
            "elapsed_seconds": round(elapsed_seconds, 3),
        }
        results.append(result)
        if on_result is not None:
            on_result(result)

    return {
        "backend": "mlx",
        "base_model": model_path,
        "adapter": adapter_path,
        "prompts_file": str(prompts),
        "max_tokens": token_limit,
        "temperature": sampling_temperature,
        "created_at": datetime.now(UTC).isoformat(),
        "prompt_count": len(results),
        "results": results,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run configured MLX inference prompts and retain raw reasoning-channel output"
        )
    )
    parser.add_argument("--config", required=True, help="Project TOML configuration")
    parser.add_argument("--adapter", help="Adapter overriding verification.adapter")
    parser.add_argument(
        "--base-model",
        action="store_true",
        help="Run the configured base model without an adapter",
    )
    parser.add_argument("--prompts", help="Prompt JSONL overriding verification.prompts_file")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="JSON report path")
    parser.add_argument(
        "--prompt-id",
        action="append",
        dest="prompt_ids",
        help="Run only this prompt id; repeat for multiple prompts",
    )
    parser.add_argument("--max-tokens", type=int, help="Override max_total_new_tokens")
    parser.add_argument("--temperature", type=float, help="Override inference temperature")
    parser.add_argument(
        "--show-raw",
        action="store_true",
        help="Print raw output, including reasoning channels, while running",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = load_config(args.config)
    if args.base_model and args.adapter:
        raise ValueError("Pass either --base-model or --adapter, not both")
    adapter = None if args.base_model else (
        args.adapter or nested(config, "verification", "adapter")
    )
    if not adapter and not args.base_model:
        raise ValueError(
            "Inference adapter is missing; pass --adapter, --base-model, or set "
            "verification.adapter"
        )
    prompts_value = args.prompts or nested(config, "verification", "prompts_file")
    if not prompts_value:
        raise ValueError(
            "Inference prompts are missing; pass --prompts or set verification.prompts_file"
        )
    prompt_path = resolve_path(prompts_value)

    def print_result(result: dict[str, Any]) -> None:
        print(
            f"[{result['id']}] tokens={result['generation_tokens']} "
            f"finish={result['finish_reason']} visible={result['output_characters']} chars"
        )
        selected_output = result["raw_output"] if args.show_raw else result["output"]
        if selected_output:
            print(selected_output)
        else:
            print("(empty output)")
        print()

    report = run_mlx_inference(
        config,
        adapter,
        prompt_path,
        selected_ids=set(args.prompt_ids) if args.prompt_ids else None,
        max_tokens=args.max_tokens,
        temperature=args.temperature,
        on_result=print_result,
    )
    output = resolve_path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Inference report written to {output}")


if __name__ == "__main__":
    main()
