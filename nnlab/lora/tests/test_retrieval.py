import tempfile
import unittest
from pathlib import Path

from finetune_lora.retrieval import build_index, format_context, search


class RetrievalTests(unittest.TestCase):
    def test_index_finds_symbol_and_formats_location(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            project = tmp_path / "demo"
            project.mkdir()
            (project / "service.py").write_text(
                "class ConnectionPool:\n"
                "    def acquire_connection(self):\n"
                "        return 'connected'\n"
            )
            index = tmp_path / "code.sqlite3"
            count = build_index(
                [project],
                index,
                chunk_lines=20,
                overlap_lines=2,
                max_file_bytes=10_000,
            )

            results = search(index, "Where is acquire_connection implemented?", top_k=3)

            self.assertEqual(count, 1)
            self.assertEqual(results[0].path, "service.py")
            self.assertIn("acquire_connection", results[0].content)
            self.assertIn("demo/service.py:1-3", format_context(results))


if __name__ == "__main__":
    unittest.main()
