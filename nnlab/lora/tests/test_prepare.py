import json
import tempfile
import unittest
from pathlib import Path

from finetune_lora.prepare import prepare


class PrepareTests(unittest.TestCase):
    def test_prepare_accepts_qt_designer_ui_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            source = tmp_path / "network.ui"
            source.write_text(
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<ui version="4.0">\n'
                " <class>NetworkView</class>\n"
                ' <widget class="QWidget" name="NetworkView"/>\n'
                "</ui>\n"
            )
            output = tmp_path / "out"

            manifest = prepare(
                [source],
                output / "train.jsonl",
                output / "validation.jsonl",
                output / "manifest.json",
                chunk_lines=10,
                overlap_lines=1,
                max_file_bytes=10_000,
                validation_ratio=0,
                seed=42,
            )

            records = [
                json.loads(line) for line in (output / "train.jsonl").read_text().splitlines()
            ]
            ui_record = next(
                record for record in records if record["metadata"]["path"] == "network.ui"
            )
            self.assertEqual(manifest["projects"][0]["included_files"], 1)
            self.assertTrue(ui_record["completion"][0]["content"].startswith("```xml\n"))

    def test_prepare_accepts_an_individual_source_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            project = tmp_path / "sample"
            project.mkdir()
            source = project / "Service.swift"
            source.write_text("struct Service {\n    let value = 42\n}\n")
            (project / "Ignored.swift").write_text("struct Ignored {}\n")
            output = tmp_path / "out"

            manifest = prepare(
                [source],
                output / "train.jsonl",
                output / "validation.jsonl",
                output / "manifest.json",
                chunk_lines=10,
                overlap_lines=1,
                max_file_bytes=10_000,
                validation_ratio=0,
                seed=42,
            )

            records = [
                json.loads(line) for line in (output / "train.jsonl").read_text().splitlines()
            ]
            self.assertEqual(manifest["projects"][0]["root"], str(project.resolve()))
            self.assertEqual(manifest["projects"][0]["included_files"], 1)
            self.assertEqual(
                {record["metadata"]["path"] for record in records},
                {"Service.swift", "<repository-tree>"},
            )

    def test_prepare_writes_completion_dataset_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            project = tmp_path / "sample"
            project.mkdir()
            (project / "one.py").write_text("def one():\n    return 1\n")
            (project / "two.ts").write_text("export const two = 2;\n")
            output = tmp_path / "out"

            manifest = prepare(
                [project],
                output / "train.jsonl",
                output / "validation.jsonl",
                output / "manifest.json",
                chunk_lines=10,
                overlap_lines=1,
                max_file_bytes=10_000,
                validation_ratio=0,
                seed=42,
            )

            records = [
                json.loads(line) for line in (output / "train.jsonl").read_text().splitlines()
            ]
            self.assertEqual(manifest["train_records"], 3)
            self.assertEqual(manifest["validation_records"], 0)
            self.assertTrue(
                all(record["completion"][0]["role"] == "assistant" for record in records)
            )
            self.assertEqual(
                {record["metadata"]["path"] for record in records},
                {"one.py", "two.ts", "<repository-tree>"},
            )


if __name__ == "__main__":
    unittest.main()
