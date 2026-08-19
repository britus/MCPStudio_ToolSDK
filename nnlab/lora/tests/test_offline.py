import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from finetune_lora.chat import _lmstudio_answer
from finetune_lora.config import model_source


class _Response:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self) -> bytes:
        return json.dumps(
            {"choices": [{"message": {"content": "local answer"}}]}
        ).encode()


class OfflineTests(unittest.TestCase):
    def test_model_source_requires_existing_local_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            model = Path(directory) / "model"
            model.mkdir()
            config = {"model": {"id": str(model), "local_files_only": True}}

            self.assertEqual(model_source(config), str(model.resolve()))

    def test_model_source_rejects_remote_mode(self) -> None:
        config = {"model": {"id": "some/model", "local_files_only": False}}

        with self.assertRaisesRegex(ValueError, "local models only"):
            model_source(config)

    @patch("urllib.request.urlopen", return_value=_Response())
    def test_lmstudio_client_uses_configured_local_endpoint(self, urlopen) -> None:
        config = {
            "inference": {
                "base_url": "http://127.0.0.1:1234/v1",
                "api_key": "local",
                "model": "local-model",
                "temperature": 0.1,
                "max_new_tokens": 20,
            }
        }

        with patch.dict(
            os.environ,
            {
                "LM_STUDIO_BASE_URL": "http://127.0.0.1:1234/v1",
                "LM_STUDIO_MODEL": "local-model",
            },
            clear=False,
        ):
            answer = _lmstudio_answer(
                config,
                [{"role": "user", "content": "test"}],
            )

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:1234/v1/chat/completions")
        self.assertEqual(answer, "local answer")

    def test_lmstudio_client_rejects_remote_endpoint(self) -> None:
        config = {
            "inference": {
                "base_url": "https://example.com/v1",
                "model": "remote-model",
            }
        }
        with (
            patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(ValueError, "loopback"),
        ):
            _lmstudio_answer(config, [{"role": "user", "content": "test"}])


if __name__ == "__main__":
    unittest.main()
