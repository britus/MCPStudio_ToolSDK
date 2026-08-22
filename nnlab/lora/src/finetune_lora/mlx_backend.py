from __future__ import annotations

import hashlib
import json
import math
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from .chat import _strip_reasoning
from .config import load_config, model_source, nested, resolve_path
from .dataset import fold_system_messages, read_jsonl, split_record
from .modeling import load_tokenizer
from .output_cleanup import reset_generated_directory

PREFERRED_CHAT_TEMPLATE = "gemma-4-chat-template-fixed.jinja"


def synchronize_training_chat_template(model_path: Path) -> str | None:
    """Use the same preferred chat template for MLX training and fused inference."""
    preferred_path = model_path / PREFERRED_CHAT_TEMPLATE
    tokenizer_config_path = model_path / "tokenizer_config.json"
    if not preferred_path.is_file():
        return None
    if not tokenizer_config_path.is_file():
        raise FileNotFoundError(f"Tokenizer config not found: {tokenizer_config_path}")

    template = preferred_path.read_text(encoding="utf-8")
    tokenizer_config = json.loads(tokenizer_config_path.read_text(encoding="utf-8"))
    tokenizer_config["chat_template"] = template
    tokenizer_config_path.write_text(
        json.dumps(tokenizer_config, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (model_path / "chat_template.jinja").write_text(template, encoding="utf-8")
    return hashlib.sha256(template.encode("utf-8")).hexdigest()


def _chat_record(record: dict[str, Any]) -> dict[str, Any]:
    messages = fold_system_messages(record["prompt"])
    messages.extend(fold_system_messages(record["completion"]))
    return {"messages": messages}


def prepare_mlx_data(
    train_path: Path,
    validation_path: Path,
    output_dir: Path,
    *,
    tokenizer: Any | None = None,
    max_length: int | None = None,
) -> tuple[int, int]:
    if (tokenizer is None) != (max_length is None):
        raise ValueError("tokenizer and max_length must be provided together")
    output_dir.mkdir(parents=True, exist_ok=True)

    def prepare(path: Path) -> list[dict[str, Any]]:
        records = read_jsonl(path)
        if tokenizer is not None and max_length is not None:
            records = [
                segment
                for record in records
                for segment in split_record(record, tokenizer, max_length)
            ]
        return [_chat_record(record) for record in records]

    train_records = prepare(train_path)
    validation_records = (
        prepare(validation_path)
        if validation_path.exists() and validation_path.stat().st_size
        else []
    )

    def write(name: str, records: list[dict[str, Any]]) -> None:
        with (output_dir / name).open("w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    write("train.jsonl", train_records)
    if validation_records:
        write("valid.jsonl", validation_records)
        write("test.jsonl", validation_records)
    return len(train_records), len(validation_records)


def _mlx_lora_command() -> list[str]:
    executable = Path(sys.executable).with_name("mlx_lm.lora")
    if executable.is_file():
        return [str(executable)]
    discovered = shutil.which("mlx_lm.lora")
    if discovered:
        return [discovered]
    try:
        import mlx_lm  # noqa: F401
    except ImportError as error:
        raise RuntimeError(
            "This is an MLX model. Install the local MLX training backend with "
            "scripts/setup.sh --mlx"
        ) from error
    return [sys.executable, "-m", "mlx_lm.lora"]


def _yaml_string(value: str | Path) -> str:
    return json.dumps(str(value))


_VALIDATION_LINE = re.compile(
    r"Iter\s+(?P<iteration>\d+):\s+Val loss\s+"
    r"(?P<loss>[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|inf(?:inity)?|nan))",
    re.IGNORECASE,
)


def _run_training_process(
    command: list[str],
    *,
    early_stopping: bool,
    patience: int,
    min_delta: float,
) -> tuple[list[dict[str, float | int]], bool, int]:
    history: list[dict[str, float | int]] = []
    best_loss: float | None = None
    stale_evaluations = 0
    stopped = False
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="", flush=True)
        match = _VALIDATION_LINE.search(line)
        if not match:
            continue
        iteration = int(match.group("iteration"))
        loss = float(match.group("loss"))
        history.append({"iteration": iteration, "validation_loss": loss})
        if not math.isfinite(loss):
            if early_stopping:
                stopped = True
                process.terminate()
                break
            continue
        if iteration <= 1:
            continue
        if best_loss is None or loss < best_loss - min_delta:
            best_loss = loss
            stale_evaluations = 0
        else:
            stale_evaluations += 1
        if early_stopping and stale_evaluations >= patience:
            stopped = True
            process.terminate()
            break
    if stopped:
        try:
            return_code = process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            process.kill()
            return_code = process.wait()
    else:
        return_code = process.wait()
    return history, stopped, return_code


def _restore_best_checkpoint(
    output_dir: Path,
    history: list[dict[str, float | int]],
    iterations: int,
    stopped: bool,
) -> tuple[Path | None, float | None, int | None]:
    candidates: list[tuple[dict[str, float | int], Path]] = []
    for item in history:
        iteration = int(item["iteration"])
        loss = float(item["validation_loss"])
        if iteration <= 1 or not math.isfinite(loss):
            continue
        checkpoint = output_dir / f"{iteration:07d}_adapters.safetensors"
        if checkpoint.is_file():
            candidates.append((item, checkpoint))
        elif iteration == iterations and not stopped:
            final_adapter = output_dir / "adapters.safetensors"
            if final_adapter.is_file():
                candidates.append((item, final_adapter))
    if not candidates:
        return None, None, None
    best, checkpoint = min(
        candidates, key=lambda candidate: float(candidate[0]["validation_loss"])
    )
    iteration = int(best["iteration"])
    target = output_dir / "adapters.safetensors"
    if checkpoint != target:
        shutil.copy2(checkpoint, target)
    return checkpoint, float(best["validation_loss"]), iteration


def train_mlx(
    config_path: str,
    resume_adapter_file: str | None = None,
    smoke_test: bool = False,
) -> Path:
    if sys.platform != "darwin" or platform.machine() != "arm64":
        raise RuntimeError("MLX training requires an Apple Silicon Mac.")
    config = load_config(config_path)
    model_path = Path(model_source(config))
    chat_template_sha256 = synchronize_training_chat_template(model_path)
    tokenizer = load_tokenizer(model_path, local_files_only=True)
    train_path = resolve_path(nested(config, "data", "train_file"))
    validation_path = resolve_path(nested(config, "data", "validation_file"))
    data_dir = resolve_path(nested(config, "training", "mlx_data_dir"))
    output_dir = resolve_path(nested(config, "training", "output_dir"))
    if smoke_test:
        output_dir = output_dir.with_name(output_dir.name + "_smoke")
    clean_output_dir = bool(nested(config, "training", "clean_output_dir", True))
    if clean_output_dir and not resume_adapter_file:
        output_dir = reset_generated_directory(output_dir)
    else:
        output_dir.mkdir(parents=True, exist_ok=True)
    seq_limit = 4096
    max_seq_length = (
        min(int(nested(config, "data", "max_seq_length", seq_limit)), seq_limit)
        if smoke_test
        else int(nested(config, "data", "max_seq_length", seq_limit))
    )
    train_count, validation_count = prepare_mlx_data(
        train_path,
        validation_path,
        data_dir,
        tokenizer=tokenizer,
        max_length=max_seq_length,
    )

    rank = int(nested(config, "training", "lora_rank", 8))
    alpha = float(nested(config, "training", "lora_alpha", 16))
    iterations = (
        1
        if smoke_test
        else int(nested(config, "training", "mlx_iterations", 200))
    )
    num_layers = (
        1
        if smoke_test
        else int(nested(config, "training", "mlx_num_layers", 4))
    )
    accumulation_steps = (
        1
        if smoke_test
        else int(nested(config, "training", "gradient_accumulation_steps", 8))
    )
    evaluation_interval = (
        1
        if smoke_test
        else int(nested(config, "checkpoint_policy", "evaluation_interval", 50))
    )
    checkpoint_selection = bool(
        nested(config, "checkpoint_policy", "restore_best", True)
    ) and validation_count > 0
    early_stopping = (
        not smoke_test
        and validation_count > 0
        and bool(nested(config, "checkpoint_policy", "early_stopping", False))
    )
    patience = int(nested(config, "checkpoint_policy", "patience", 3))
    min_delta = float(nested(config, "checkpoint_policy", "min_delta", 0.0))
    if patience < 1:
        raise ValueError("checkpoint_policy.patience must be at least 1")
    yaml_path = output_dir / "mlx_train_config.yaml"
    yaml_text = "\n".join(
        [
            f"model: {_yaml_string(model_path)}",
            "train: true",
            "fine_tune_type: lora",
            f"data: {_yaml_string(data_dir)}",
            f"seed: {int(nested(config, 'data', 'seed', 42))}",
            f"num_layers: {num_layers}",
            f"batch_size: {int(nested(config, 'training', 'train_batch_size', 1))}",
            f"iters: {iterations}",
            (
                "val_batches: "
                + str(
                    1
                    if smoke_test
                    else int(nested(config, "training", "mlx_eval_batches", 20))
                )
            ),
            f"learning_rate: {float(nested(config, 'training', 'learning_rate', 1e-5))}",
            f"steps_per_report: {1 if smoke_test else 5}",
            f"steps_per_eval: {evaluation_interval}",
            f"grad_accumulation_steps: {accumulation_steps}",
            f"adapter_path: {_yaml_string(output_dir)}",
            f"save_every: {evaluation_interval if checkpoint_selection else int(nested(config, 'training', 'mlx_save_every', 50))}",
            f"max_seq_length: {max_seq_length}",
            "mask_prompt: true",
            (
                "grad_checkpoint: "
                + str(
                    bool(nested(config, "training", "gradient_checkpointing", True))
                ).lower()
            ),
            "report_to: null",
            "lora_parameters:",
            f"  rank: {rank}",
            f"  scale: {alpha / rank}",
            f"  dropout: {float(nested(config, 'training', 'lora_dropout', 0.0))}",
            "",
        ]
    )
    yaml_path.write_text(yaml_text, encoding="utf-8")
    summary = {
        "backend": "mlx",
        "model": str(model_path),
        "quantized": True,
        "train_records": train_count,
        "validation_records": validation_count,
        "config": str(yaml_path),
        "smoke_test": smoke_test,
        "chat_template_sha256": chat_template_sha256,
        "checkpoint_policy": {
            "metric": "validation_loss",
            "evaluation_interval": evaluation_interval,
            "early_stopping": early_stopping,
            "patience": patience,
            "min_delta": min_delta,
            "restore_best": checkpoint_selection,
        },
    }
    (output_dir / "train_setup.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    command = [*_mlx_lora_command(), "--config", str(yaml_path)]
    if resume_adapter_file:
        command.extend(["--resume-adapter-file", str(resolve_path(resume_adapter_file))])
    print("Detected MLX quantized model; starting local MLX QLoRA.", flush=True)
    print(
        f"Prepared {train_count} train and {validation_count} validation records.",
        flush=True,
    )
    history, stopped, return_code = _run_training_process(
        command,
        early_stopping=early_stopping,
        patience=patience,
        min_delta=min_delta,
    )
    if return_code != 0 and not stopped:
        raise subprocess.CalledProcessError(return_code, command)
    best_checkpoint: Path | None = None
    best_loss: float | None = None
    best_iteration: int | None = None
    if checkpoint_selection:
        best_checkpoint, best_loss, best_iteration = _restore_best_checkpoint(
            output_dir, history, iterations, stopped
        )
    metrics_finite = all(
        math.isfinite(float(item["validation_loss"])) for item in history
    )
    train_summary = {
        **summary,
        "validation_history": history,
        "metrics_finite": metrics_finite,
        "early_stopped": stopped,
        "best_validation_loss": best_loss,
        "best_iteration": best_iteration,
        "best_checkpoint": str(best_checkpoint) if best_checkpoint else None,
        "restored_best_checkpoint": bool(best_checkpoint and checkpoint_selection),
    }
    (output_dir / "train_summary.json").write_text(
        json.dumps(train_summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return output_dir



def _mlx_prompt_checks(
    model: Any,
    tokenizer: Any,
    path: Path,
    max_total_new: int,
    temperature: float,
) -> list[dict[str, Any]]:
    from mlx_lm import stream_generate
    from mlx_lm.sample_utils import make_sampler

    if not path.exists():
        return []
    checks: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        items = [json.loads(line) for line in handle if line.strip()]
    sampler = make_sampler(temp=max(temperature, 0.0))
    for item in items:
        prompt = fold_system_messages(item["prompt"])
        text = tokenizer.apply_chat_template(
            prompt,
            tokenize=False,
            add_generation_prompt=True,
        )
        generated_parts: list[str] = []
        generation_tokens = 0
        finish_reason = "length"
        for response in stream_generate(
            model,
            tokenizer,
            text,
            max_tokens=max_total_new,
            sampler=sampler,
        ):
            generated_parts.append(response.text)
            generation_tokens = response.generation_tokens
            if response.finish_reason is not None:
                finish_reason = response.finish_reason
        generated = _strip_reasoning("".join(generated_parts))
        truncated = finish_reason != "stop"
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
                "generation_tokens": generation_tokens,
                "finish_reason": finish_reason,
                "truncated": truncated,
            }
        )
    return checks

def evaluate_mlx(
    config_path: str,
    adapter: str | None,
    prompts: str | None = None,
) -> dict[str, Any]:
    from mlx_lm import load

    config = load_config(config_path)
    model_path = Path(model_source(config))
    train_path = resolve_path(nested(config, "data", "train_file"))
    validation_path = resolve_path(nested(config, "data", "validation_file"))
    data_dir = resolve_path(nested(config, "training", "mlx_data_dir"))
    data_tokenizer = load_tokenizer(model_path, local_files_only=True)
    seq_limit = 4096
    prepare_mlx_data(
        train_path,
        validation_path,
        data_dir,
        tokenizer=data_tokenizer,
        max_length=int(nested(config, "data", "max_seq_length", seq_limit)),
    )
    adapter_path = str(resolve_path(adapter)) if adapter else ""
    model, tokenizer = load(str(model_path), adapter_path=adapter_path or None)
    command = [
        *_mlx_lora_command(),
        "--model",
        str(model_path),
        "--data",
        str(data_dir),
        "--test",
        "--adapter-path",
        adapter_path,
        "--batch-size",
        str(int(nested(config, "training", "eval_batch_size", 1))),
        "--test-batches",
        str(int(nested(config, "training", "mlx_eval_batches", 20))),
        "--max-seq-length",
        str(int(nested(config, "data", "max_seq_length", seq_limit))),
        "--mask-prompt",
    ]
    result = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
    )
    print(result.stdout, end="")
    number = r"(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"
    match = re.search(
        rf"Test loss\s+({number}),\s+Test ppl\s+({number})",
        result.stdout,
    )
    checks = (
        _mlx_prompt_checks(
            model,
            tokenizer,
            resolve_path(prompts),
            int(
                nested(
                    config,
                    "inference",
                    "max_total_new_tokens",
                    nested(config, "inference", "max_new_tokens", 1024),
                )
            ),
            float(nested(config, "inference", "temperature", 0.15)),
        )
        if prompts
        else []
    )
    return {
        "backend": "mlx",
        "base_model": str(model_path),
        "adapter": adapter_path or None,
        "test_loss": float(match.group(1)) if match else None,
        "perplexity": float(match.group(2)) if match else None,
        "test_batches": int(nested(config, "training", "mlx_eval_batches", 20)),
        "prompt_checks": checks,
        "prompt_pass_rate": _prompt_pass_rate(checks),
    }


def _prompt_pass_rate(checks: list[dict[str, Any]]) -> float | None:
    scored = [check for check in checks if check.get("scored") is True]
    if not scored:
        return None
    return sum(check.get("passed") is True for check in scored) / len(scored)
