import unittest

from finetune_lora.chat import _strip_reasoning


class ChatReasoningTests(unittest.TestCase):
    def test_strip_complete_thinking_block(self) -> None:
        text = "<|channel>thought\ninternal reasoning\n<channel|>\nFinal answer"
        self.assertEqual(_strip_reasoning(text), "Final answer")

    def test_strip_incomplete_thinking_block(self) -> None:
        text = "<|channel>thought\ntruncated reasoning continues to end"
        self.assertEqual(_strip_reasoning(text), "")

    def test_pass_through_text_without_reasoning(self) -> None:
        text = "Just a plain answer."
        self.assertEqual(_strip_reasoning(text), "Just a plain answer.")

    def test_strips_leading_and_trailing_whitespace(self) -> None:
        text = "<|channel>thought\nreasoning\n<channel|>\n\nAnswer\n\n"
        self.assertEqual(_strip_reasoning(text), "Answer")


if __name__ == "__main__":
    unittest.main()
