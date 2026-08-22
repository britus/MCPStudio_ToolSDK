import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from finetune_lora.inference_test import _load_prompt_records, run_mlx_inference


class InferenceTestTests(unittest.TestCase):
    def test_loads_only_selected_prompt_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            prompts = Path(directory) / "prompts.jsonl"
            prompts.write_text(
                json.dumps({"id": "first", "prompt": [{"role": "user", "content": "A"}]})
                + "\n"
                + json.dumps({"id": "second", "prompt": [{"role": "user", "content": "B"}]})
                + "\n"
            )

            records = _load_prompt_records(prompts, {"second"})

        self.assertEqual([record["id"] for record in records], ["second"])

    def test_rejects_unknown_selected_prompt_id(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            prompts = Path(directory) / "prompts.jsonl"
            prompts.write_text(
                json.dumps({"id": "known", "prompt": [{"role": "user", "content": "A"}]})
                + "\n"
            )

            with self.assertRaisesRegex(ValueError, "Unknown prompt id"):
                _load_prompt_records(prompts, {"missing"})

    def test_mlx_report_retains_raw_and_stripped_output(self) -> None:
        mlx_module = ModuleType("mlx_lm")
        sample_module = ModuleType("mlx_lm.sample_utils")
        load_calls: list[tuple[str, str | None]] = []

        class Tokenizer:
            def apply_chat_template(self, *args: object, **kwargs: object) -> str:
                return "rendered prompt"

        def load(model_path: str, adapter_path: str | None = None):
            load_calls.append((model_path, adapter_path))
            return object(), Tokenizer()

        def stream_generate(*args: object, **kwargs: object):
            self.assertEqual(kwargs["max_tokens"], 321)
            yield SimpleNamespace(
                text="<|channel>thought\nprivate reasoning\n<channel|>\n",
                generation_tokens=10,
                finish_reason=None,
            )
            yield SimpleNamespace(
                text="Visible answer",
                generation_tokens=12,
                finish_reason="stop",
            )

        mlx_module.load = load  # type: ignore[attr-defined]
        mlx_module.stream_generate = stream_generate  # type: ignore[attr-defined]
        sample_module.make_sampler = lambda **kwargs: kwargs  # type: ignore[attr-defined]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model = root / "model"
            adapter = root / "adapter"
            model.mkdir()
            adapter.mkdir()
            prompts = root / "prompts.jsonl"
            prompts.write_text(
                json.dumps(
                    {"id": "diagnostic", "prompt": [{"role": "user", "content": "Question"}]}
                )
                + "\n"
            )
            config = {
                "model": {"id": str(model), "local_files_only": True},
                "inference": {
                    "backend": "mlx",
                    "temperature": 0.0,
                    "max_total_new_tokens": 321,
                },
            }
            with patch.dict(
                sys.modules,
                {"mlx_lm": mlx_module, "mlx_lm.sample_utils": sample_module},
            ):
                report = run_mlx_inference(config, str(adapter), prompts)

        self.assertEqual(len(load_calls), 1)
        self.assertEqual(report["prompt_count"], 1)
        result = report["results"][0]
        self.assertIn("private reasoning", result["raw_output"])
        self.assertEqual(result["output"], "Visible answer")
        self.assertEqual(result["generation_tokens"], 12)
        self.assertFalse(result["truncated"])


if __name__ == "__main__":
    unittest.main()
