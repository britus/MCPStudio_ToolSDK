import json
import tempfile
import unittest
import warnings
from pathlib import Path

from finetune_lora.dataset import (
    CompletionDataset,
    encode_record,
    fold_system_messages,
    split_record,
)


class CharacterTokenizer:
    pad_token_id = 0

    def apply_chat_template(
        self,
        messages: list[dict[str, str]],
        *,
        tokenize: bool,
        add_generation_prompt: bool,
    ) -> str:
        assert not tokenize
        text = "".join(
            f"<{message['role']}>{message['content']}" for message in messages
        )
        if add_generation_prompt:
            text += "<assistant>"
        return text

    def __call__(self, text: str, *, add_special_tokens: bool) -> dict[str, list[int]]:
        assert not add_special_tokens
        return {"input_ids": list(range(len(text)))}


class DatasetTests(unittest.TestCase):
    def test_system_message_is_folded_into_first_user_for_gemma(self) -> None:
        messages = [
            {"role": "system", "content": "Use repository context."},
            {"role": "user", "content": "Where is Widget built?"},
        ]

        folded = fold_system_messages(messages)

        self.assertEqual(len(folded), 1)
        self.assertEqual(folded[0]["role"], "user")
        self.assertIn("Use repository context.", folded[0]["content"])
        self.assertIn("Where is Widget built?", folded[0]["content"])
        self.assertEqual(messages[1]["content"], "Where is Widget built?")

    def test_long_completion_is_split_without_losing_content(self) -> None:
        tokenizer = CharacterTokenizer()
        content = (
            "First complete sentence. "
            "Second complete sentence with more detail. "
            "Third complete sentence with the final detail."
        )
        record = {
            "prompt": [{"role": "user", "content": "Describe the commands."}],
            "completion": [{"role": "assistant", "content": content}],
            "metadata": {"source": "fixture"},
        }

        segments = split_record(record, tokenizer, max_length=105)

        self.assertGreater(len(segments), 1)
        self.assertEqual(
            "".join(item["completion"][0]["content"] for item in segments),
            content,
        )
        for index, item in enumerate(segments, 1):
            rendered = tokenizer.apply_chat_template(
                fold_system_messages(item["prompt"])
                + fold_system_messages(item["completion"]),
                tokenize=False,
                add_generation_prompt=False,
            )
            self.assertLessEqual(len(rendered), 105)
            self.assertEqual(item["metadata"]["sequence_segment"], index)
            self.assertEqual(
                item["metadata"]["sequence_segments"], len(segments)
            )
        self.assertIn("Continue", segments[1]["prompt"][-1]["content"])

    def test_unsplit_encoder_rejects_overlength_record(self) -> None:
        tokenizer = CharacterTokenizer()
        record = {
            "prompt": [{"role": "user", "content": "Prompt"}],
            "completion": [{"role": "assistant", "content": "x" * 100}],
        }

        with self.assertRaisesRegex(ValueError, "split it with split_record"):
            encode_record(record, tokenizer, max_length=50)

    def test_completion_dataset_expands_instead_of_truncating(self) -> None:
        tokenizer = CharacterTokenizer()
        content = "Sentence one. Sentence two. Sentence three. " * 4
        record = {
            "prompt": [{"role": "user", "content": "Prompt"}],
            "completion": [{"role": "assistant", "content": content}],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "data.jsonl"
            path.write_text(json.dumps(record) + "\n", encoding="utf-8")
            with warnings.catch_warnings(record=True) as caught:
                dataset = CompletionDataset(path, tokenizer, max_length=100)

        self.assertGreater(len(dataset), 1)
        self.assertTrue(
            any(
                "no completion content was discarded" in str(w.message)
                for w in caught
            )
        )
        self.assertTrue(all(len(item["input_ids"]) <= 100 for item in dataset.items))


if __name__ == "__main__":
    unittest.main()
