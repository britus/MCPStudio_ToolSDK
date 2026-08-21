from __future__ import annotations

from pathlib import Path

import pytest

from finetune_lora.docling_poc import discover_pdfs, ensure_new_output


def test_discovers_pdf_files_recursively_and_deduplicates(tmp_path: Path) -> None:
    source = tmp_path / "source"
    nested = source / "nested"
    nested.mkdir(parents=True)
    first = source / "first.pdf"
    second = nested / "SECOND.PDF"
    first.write_bytes(b"first")
    second.write_bytes(b"second")
    (source / "ignored.txt").write_text("ignored", encoding="utf-8")

    assert discover_pdfs([source, first]) == [first.resolve(), second.resolve()]


def test_rejects_non_pdf_file(tmp_path: Path) -> None:
    text = tmp_path / "document.txt"
    text.write_text("not a PDF", encoding="utf-8")

    with pytest.raises(ValueError, match="not a PDF"):
        discover_pdfs([text])


def test_requires_fresh_output_directory(tmp_path: Path) -> None:
    output = tmp_path / "output"
    output.mkdir()

    with pytest.raises(FileExistsError, match="already exists"):
        ensure_new_output(output)


def test_prepares_parent_for_new_output(tmp_path: Path) -> None:
    output = tmp_path / "nested" / "output"

    assert ensure_new_output(output) == output.resolve()
    assert output.parent.is_dir()
    assert not output.exists()
