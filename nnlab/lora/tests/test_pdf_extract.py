from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

import pytest

from finetune_lora.pdf_extract import extract_pdfs


def _write_pdf(writer: Any, path: Path) -> None:
    buffer = BytesIO()
    writer.write(buffer)
    path.write_bytes(buffer.getvalue())


def test_extract_single_pdf(tmp_path: Path) -> None:
    from pypdf import PdfWriter

    pdf_path = tmp_path / "sample.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.add_blank_page(width=612, height=792)
    _write_pdf(writer, pdf_path)

    output_dir = tmp_path / "out"
    extracted, skipped = extract_pdfs(pdf_path, output_dir, min_text_chars=0)

    assert len(extracted) == 1
    assert len(skipped) == 0
    assert extracted[0].relative_path == "sample.pdf"
    assert (output_dir / "sample.txt").exists()


def test_extract_directory_preserves_structure(tmp_path: Path) -> None:
    from pypdf import PdfWriter

    source = tmp_path / "source"
    (source / "sub").mkdir(parents=True)
    for name in ["a.pdf", "sub/b.pdf"]:
        pdf_path = source / name
        writer = PdfWriter()
        writer.add_blank_page(width=612, height=792)
        _write_pdf(writer, pdf_path)

    output_dir = tmp_path / "out"
    extracted, skipped = extract_pdfs(source, output_dir, min_text_chars=0)

    assert len(extracted) == 2
    assert len(skipped) == 0
    assert (output_dir / "a.txt").exists()
    assert (output_dir / "sub/b.txt").exists()


def test_extract_skips_non_pdf(tmp_path: Path) -> None:
    pdf_path = tmp_path / "not_a_pdf.txt"
    pdf_path.write_text("hello")

    with pytest.raises(ValueError, match="Source file is not a PDF"):
        extract_pdfs(pdf_path, tmp_path / "out")


def test_extract_skips_empty_pdf(tmp_path: Path) -> None:
    from pypdf import PdfWriter

    pdf_path = tmp_path / "empty.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    _write_pdf(writer, pdf_path)

    extracted, skipped = extract_pdfs(pdf_path, tmp_path / "out", min_text_chars=1000)

    assert len(extracted) == 0
    assert len(skipped) == 1
    assert "insufficient text" in skipped[0].reason
