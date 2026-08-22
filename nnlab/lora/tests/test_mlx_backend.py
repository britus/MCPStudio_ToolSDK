import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from finetune_lora.mlx_backend import (
    _mlx_prompt_checks,
    _prompt_pass_rate,
    _restore_best_checkpoint,
    _verification_generation_settings,
    prepare_mlx_data,
    synchronize_training_chat_template,
)
from finetune_lora.modeling import detect_model_backend


class MlxBackendTests(unittest.TestCase):
    def test_verification_generation_overrides_general_inference_sampling(self) -> None:
        settings = _verification_generation_settings(
            {
                "inference": {"temperature": 0.25, "max_total_new_tokens": 16384},
                "verification": {"temperature": 0.0, "max_new_tokens": 4096},
            }
        )

        self.assertEqual(settings, (4096, 0.0))

    def test_unscored_semantic_checks_do_not_report_an_artificial_pass(self) -> None:
        checks = [{"passed": None, "scored": False}]

        self.assertIsNone(_prompt_pass_rate(checks))

    def test_pass_rate_uses_only_deterministically_scored_checks(self) -> None:
        checks = [
            {"passed": None, "scored": False},
            {"passed": True, "scored": True},
            {"passed": False, "scored": True},
        ]

        self.assertEqual(_prompt_pass_rate(checks), 0.5)

    def test_synchronizes_preferred_training_chat_template(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            model = Path(directory)
            preferred = "preferred {{ messages }}"
            (model / "gemma-4-chat-template-fixed.jinja").write_text(preferred)
            (model / "chat_template.jinja").write_text("old file template")
            (model / "tokenizer_config.json").write_text(
                json.dumps({"chat_template": "old embedded template"})
            )

            digest = synchronize_training_chat_template(model)

            tokenizer_config = json.loads((model / "tokenizer_config.json").read_text())
            self.assertEqual(tokenizer_config["chat_template"], preferred)
            self.assertEqual((model / "chat_template.jinja").read_text(), preferred)
            self.assertEqual(len(digest or ""), 64)

    def test_detects_mlx_affine_quantization(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            model = Path(directory)
            (model / "config.json").write_text(
                json.dumps(
                    {
                        "model_type": "gemma4",
                        "quantization_config": {
                            "bits": 4,
                            "group_size": 64,
                            "mode": "affine",
                        },
                    }
                )
            )

            self.assertEqual(detect_model_backend(model), "mlx")

    def test_transformers_quantization_requires_explicit_quant_method(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            model = Path(directory)
            (model / "config.json").write_text(
                json.dumps(
                    {
                        "model_type": "gemma3_text",
                        "quantization_config": {
                            "quant_method": "bitsandbytes_4bit",
                        },
                    }
                )
            )

            self.assertEqual(detect_model_backend(model), "transformers")

    def test_prepares_mlx_chat_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            record = {
                "prompt": [
                    {"role": "system", "content": "Use project conventions."},
                    {"role": "user", "content": "Continue this file."},
                ],
                "completion": [{"role": "assistant", "content": "return 42"}],
            }
            train = root / "source-train.jsonl"
            valid = root / "source-valid.jsonl"
            train.write_text(json.dumps(record) + "\n")
            valid.write_text(json.dumps(record) + "\n")

            counts = prepare_mlx_data(train, valid, root / "mlx")

            converted = json.loads((root / "mlx/train.jsonl").read_text())
            self.assertEqual(counts, (1, 1))
            self.assertEqual(converted["messages"][-1]["role"], "assistant")
            self.assertNotIn("system", [item["role"] for item in converted["messages"]])
            self.assertTrue((root / "mlx/test.jsonl").exists())

    def test_restores_best_available_checkpoint_after_early_stop(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            first = output / "0000050_adapters.safetensors"
            best = output / "0000100_adapters.safetensors"
            first.write_bytes(b"first")
            best.write_bytes(b"best")
            (output / "adapters.safetensors").write_bytes(b"latest-saved")

            checkpoint, loss, iteration = _restore_best_checkpoint(
                output,
                [
                    {"iteration": 50, "validation_loss": 0.9},
                    {"iteration": 100, "validation_loss": 0.7},
                    {"iteration": 150, "validation_loss": 0.6},
                ],
                iterations=150,
                stopped=True,
            )

            self.assertEqual(checkpoint, best)
            self.assertEqual(loss, 0.7)
            self.assertEqual(iteration, 100)
            self.assertEqual((output / "adapters.safetensors").read_bytes(), b"best")

    def test_length_limited_prompt_generation_cannot_pass(self) -> None:
        mlx_module = ModuleType("mlx_lm")
        sample_module = ModuleType("mlx_lm.sample_utils")

        def stream_generate(*args: object, **kwargs: object):
            self.assertEqual(kwargs["max_tokens"], 4096)
            yield SimpleNamespace(
                text="ME909s answer",
                generation_tokens=4096,
                finish_reason="length",
            )

        mlx_module.stream_generate = stream_generate  # type: ignore[attr-defined]
        sample_module.make_sampler = lambda **kwargs: object()  # type: ignore[attr-defined]

        class Tokenizer:
            def apply_chat_template(self, *args: object, **kwargs: object) -> str:
                return "prompt"

        with tempfile.TemporaryDirectory() as directory:
            prompts = Path(directory) / "prompts.jsonl"
            prompts.write_text(
                json.dumps(
                    {
                        "id": "limited",
                        "prompt": [{"role": "user", "content": "Question"}],
                        "must_contain": ["ME909s"],
                    }
                )
                + "\n"
            )
            with patch.dict(
                sys.modules,
                {"mlx_lm": mlx_module, "mlx_lm.sample_utils": sample_module},
            ):
                checks = _mlx_prompt_checks(
                    object(), Tokenizer(), prompts, 4096, 0.15
                )

        self.assertFalse(checks[0]["passed"])
        self.assertTrue(checks[0]["truncated"])
        self.assertEqual(checks[0]["finish_reason"], "length")
        self.assertEqual(checks[0]["generation_tokens"], 4096)


if __name__ == "__main__":
    unittest.main()
