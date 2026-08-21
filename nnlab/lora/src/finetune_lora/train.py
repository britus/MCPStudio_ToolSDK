from __future__ import annotations

import argparse
import inspect
import json
import math
from pathlib import Path
from typing import Any

from .config import load_config, model_source, nested, resolve_path
from .dataset import CompletionCollator, CompletionDataset
from .modeling import detect_model_backend, load_model, load_tokenizer
from .output_cleanup import reset_generated_directory


def _training_arguments(values: dict[str, Any], has_validation: bool, runtime: Any) -> Any:
    from transformers import TrainingArguments

    parameters = inspect.signature(TrainingArguments).parameters
    args: dict[str, Any] = {
        "output_dir": values["output_dir"],
        "num_train_epochs": values["epochs"],
        "per_device_train_batch_size": values["train_batch_size"],
        "per_device_eval_batch_size": values["eval_batch_size"],
        "gradient_accumulation_steps": values["gradient_accumulation_steps"],
        "learning_rate": values["learning_rate"],
        "warmup_ratio": values["warmup_ratio"],
        "weight_decay": values["weight_decay"],
        "logging_steps": values["logging_steps"],
        "save_strategy": "epoch",
        "save_total_limit": values["save_total_limit"],
        "gradient_checkpointing": values["gradient_checkpointing"],
        "report_to": "none",
        "remove_unused_columns": False,
        "optim": "paged_adamw_8bit" if values["qlora"] else "adamw_torch",
        "fp16": runtime.device == "cuda" and runtime.dtype_name == "float16",
        "bf16": runtime.device == "cuda" and runtime.dtype_name == "bfloat16",
        "load_best_model_at_end": has_validation,
    }
    if has_validation:
        args["metric_for_best_model"] = "eval_loss"
        args["greater_is_better"] = False
    strategy_key = "eval_strategy" if "eval_strategy" in parameters else "evaluation_strategy"
    args[strategy_key] = "epoch" if has_validation else "no"
    return TrainingArguments(**args)


def _train_transformers(config_path: str, resume_from_checkpoint: str | None = None) -> Path:
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import EarlyStoppingCallback, Trainer, set_seed

    config = load_config(config_path)
    model_id = model_source(config)
    revision = str(nested(config, "model", "revision", "main"))
    trust_remote_code = bool(nested(config, "model", "trust_remote_code", False))
    qlora = bool(nested(config, "training", "qlora", False))
    seed = int(nested(config, "data", "seed", 42))
    set_seed(seed)

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
        qlora=qlora,
        local_files_only=True,
    )
    if qlora:
        model = prepare_model_for_kbit_training(
            model,
            use_gradient_checkpointing=bool(
                nested(config, "training", "gradient_checkpointing", True)
            ),
        )
    model.config.use_cache = False

    max_length = int(nested(config, "data", "max_seq_length", 2048))
    train_path = resolve_path(nested(config, "data", "train_file"))
    validation_path = resolve_path(nested(config, "data", "validation_file"))
    train_dataset = CompletionDataset(train_path, tokenizer, max_length)
    validation_dataset = (
        CompletionDataset(validation_path, tokenizer, max_length)
        if validation_path.exists() and validation_path.stat().st_size
        else None
    )
    output_dir = resolve_path(nested(config, "training", "output_dir"))
    clean_output_dir = bool(nested(config, "training", "clean_output_dir", True))
    if clean_output_dir and not resume_from_checkpoint:
        output_dir = reset_generated_directory(output_dir)
    else:
        output_dir.mkdir(parents=True, exist_ok=True)
    values = {
        "output_dir": str(output_dir),
        "epochs": float(nested(config, "training", "epochs", 2.0)),
        "train_batch_size": int(nested(config, "training", "train_batch_size", 1)),
        "eval_batch_size": int(nested(config, "training", "eval_batch_size", 1)),
        "gradient_accumulation_steps": int(
            nested(config, "training", "gradient_accumulation_steps", 16)
        ),
        "learning_rate": float(nested(config, "training", "learning_rate", 2e-4)),
        "warmup_ratio": float(nested(config, "training", "warmup_ratio", 0.03)),
        "weight_decay": float(nested(config, "training", "weight_decay", 0.01)),
        "logging_steps": int(nested(config, "training", "logging_steps", 5)),
        "save_total_limit": int(nested(config, "training", "save_total_limit", 2)),
        "gradient_checkpointing": bool(
            nested(config, "training", "gradient_checkpointing", True)
        ),
        "qlora": qlora,
    }
    training_args = _training_arguments(values, validation_dataset is not None, runtime)
    lora = LoraConfig(
        r=int(nested(config, "training", "lora_rank", 16)),
        lora_alpha=int(nested(config, "training", "lora_alpha", 32)),
        lora_dropout=float(nested(config, "training", "lora_dropout", 0.05)),
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=list(nested(config, "training", "target_modules")),
    )
    model = get_peft_model(model, lora)
    if values["gradient_checkpointing"] and not qlora:
        model.enable_input_require_grads()
    model.print_trainable_parameters()
    callbacks = []
    if validation_dataset is not None and bool(
        nested(config, "checkpoint_policy", "early_stopping", False)
    ):
        callbacks.append(
            EarlyStoppingCallback(
                early_stopping_patience=int(
                    nested(config, "checkpoint_policy", "patience", 3)
                ),
                early_stopping_threshold=float(
                    nested(config, "checkpoint_policy", "min_delta", 0.0)
                ),
            )
        )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        data_collator=CompletionCollator(tokenizer),
        callbacks=callbacks,
    )
    result = trainer.train(resume_from_checkpoint=resume_from_checkpoint)
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(output_dir)
    metrics = dict(result.metrics)
    metrics.update(
        {
            "base_model": model_id,
            "runtime_device": runtime.device,
            "runtime_dtype": runtime.dtype_name,
            "train_records": len(train_dataset),
            "validation_records": len(validation_dataset) if validation_dataset else 0,
            "best_checkpoint": trainer.state.best_model_checkpoint,
            "best_validation_metric": trainer.state.best_metric,
            "early_stopping_enabled": bool(callbacks),
            "metrics_finite": all(
                not isinstance(value, (int, float)) or math.isfinite(float(value))
                for value in result.metrics.values()
            ),
        }
    )
    (output_dir / "train_summary.json").write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False) + "\n"
    )
    return output_dir


def train(
    config_path: str,
    resume_from_checkpoint: str | None = None,
    smoke_test: bool = False,
) -> Path:
    config = load_config(config_path)
    model_id = model_source(config)
    backend = detect_model_backend(
        model_id,
        str(nested(config, "training", "backend", "auto")),
    )
    if backend == "mlx":
        from .mlx_backend import train_mlx

        return train_mlx(config_path, resume_from_checkpoint, smoke_test)
    if smoke_test:
        raise ValueError("--smoke-test is currently supported for MLX models")
    return _train_transformers(config_path, resume_from_checkpoint)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fine-tune a local model using LoRA/QLoRA")
    parser.add_argument(
        "--config",
        required=True,
        help="Project TOML containing data and training settings",
    )
    parser.add_argument("--resume-from-checkpoint")
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help="Run one short MLX training iteration with conservative settings",
    )
    parser.add_argument(
        "--objective-file",
        help=(
            "Validated UTF-8 training objective used to create a reusable "
            "verification_input.json after full training"
        ),
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    output = train(args.config, args.resume_from_checkpoint, args.smoke_test)
    print(f"Adapter saved to {output}")
    verification_input_path: str | None = None
    if args.objective_file and not args.smoke_test:
        from .verification_input import create_verification_input

        verification_input = create_verification_input(
            args.config,
            output,
            args.objective_file,
        )
        try:
            verification_input_path = str(
                verification_input.relative_to(Path.cwd().resolve())
            )
        except ValueError:
            verification_input_path = str(verification_input)
        print(f"Verification input written to {verification_input}")
    setup_path = output / "train_setup.json"
    setup = json.loads(setup_path.read_text(encoding="utf-8")) if setup_path.is_file() else {}
    summary_path = output / "train_summary.json"
    summary = (
        json.loads(summary_path.read_text(encoding="utf-8"))
        if summary_path.is_file()
        else {}
    )
    artifact = output / "adapters.safetensors"
    try:
        artifact_path = str(artifact.relative_to(Path.cwd().resolve()))
    except ValueError:
        artifact_path = str(artifact)
    marker = {
        "artifactPath": artifact_path,
        "artifactPresent": artifact.is_file(),
        "finiteMetrics": bool(summary.get("metrics_finite", True)),
        "trainRecords": int(setup.get("train_records", summary.get("train_records", 0))),
        "validationRecords": int(
            setup.get("validation_records", summary.get("validation_records", 0))
        ),
        "earlyStopped": bool(summary.get("early_stopped", False)),
        "bestCheckpoint": summary.get("best_checkpoint"),
        "bestIteration": summary.get("best_iteration"),
        "bestValidationLoss": summary.get("best_validation_loss"),
        "verificationInputPath": verification_input_path,
    }
    print("FINETUNE_RESULT_JSON=" + json.dumps(marker, ensure_ascii=False))


if __name__ == "__main__":
    main()
