from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from finetune_lora.pdf_extract import (
    PdfExtractionSettings,
    discover_pdfs,
    extract_pdfs,
    settings_from_config,
)


class FakeLabel:
    def __init__(self, value: str) -> None:
        self.value = value


class FakeDocument:
    def __init__(self, text: str = "Technical documentation content") -> None:
        self.text = text
        self.pages = {1: object(), 2: object()}

    def export_to_text(self) -> str:
        return self.text

    def iterate_items(self) -> list[tuple[Any, int]]:
        return [
            (SimpleNamespace(label=FakeLabel("section_header")), 0),
            (SimpleNamespace(label=FakeLabel("table")), 1),
            (SimpleNamespace(label=FakeLabel("picture")), 1),
        ]

    def save_as_markdown(
        self,
        filename: Path,
        *,
        artifacts_dir: Path,
        page_break_placeholder: str,
        **_kwargs: Any,
    ) -> None:
        artifacts = filename.parent / artifacts_dir
        artifacts.mkdir(parents=True)
        (artifacts / "figure.png").write_bytes(b"png")
        filename.write_text(
            "# Device\n\n"
            "| Register | Value |\n"
            "|---|---|\n"
            "| CONFIG | 0x01 |\n\n"
            f"{page_break_placeholder}\n\n"
            f"![Schematic]({artifacts_dir.as_posix()}/figure.png)\n",
            encoding="utf-8",
        )


class FakeConverter:
    def __init__(
        self,
        *,
        text: str = "Technical documentation content",
        status: str = "success",
        errors: list[Any] | None = None,
    ) -> None:
        self.text = text
        self.status = status
        self.errors = errors or []

    def convert(self, _path: Path, *, raises_on_error: bool) -> Any:
        assert raises_on_error is False
        return SimpleNamespace(
            status=SimpleNamespace(value=self.status),
            errors=self.errors,
            document=FakeDocument(self.text),
        )


def _pdf(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"%PDF-1.7\nfixture\n")
    return path


def test_extract_single_pdf_to_structured_markdown(tmp_path: Path) -> None:
    pdf_path = _pdf(tmp_path / "sample.pdf")
    output_dir = tmp_path / "out"

    extracted, skipped = extract_pdfs(pdf_path, output_dir, converter=FakeConverter())

    assert skipped == []
    assert len(extracted) == 1
    item = extracted[0]
    assert item.relative_path == "sample.pdf"
    assert item.output_relative_path == "sample.md"
    assert item.materialized_path == output_dir / "sample.md"
    assert item.pages == 2
    assert item.item_counts == {"picture": 1, "section_header": 1, "table": 1}
    markdown = item.materialized_path.read_text(encoding="utf-8")
    assert "| CONFIG | 0x01 |" in markdown
    assert "<!-- page-break -->" in markdown
    assert "![Schematic](sample_artifacts/figure.png)" in markdown
    assert (output_dir / "sample_artifacts/figure.png").is_file()


def test_extract_directory_preserves_structure_and_uppercase_pdf(tmp_path: Path) -> None:
    source = tmp_path / "source"
    _pdf(source / "a.pdf")
    _pdf(source / "sub/b.PDF")

    extracted, skipped = extract_pdfs(
        source,
        tmp_path / "out",
        converter=FakeConverter(),
    )

    assert skipped == []
    assert [item.output_relative_path for item in extracted] == ["a.md", "sub/b.md"]
    assert (tmp_path / "out/a.md").is_file()
    assert (tmp_path / "out/sub/b.md").is_file()


def test_discover_rejects_non_pdf_and_missing_paths(tmp_path: Path) -> None:
    text = tmp_path / "not-a-pdf.txt"
    text.write_text("hello", encoding="utf-8")

    with pytest.raises(ValueError, match="not a PDF"):
        discover_pdfs(text)
    with pytest.raises(FileNotFoundError, match="does not exist"):
        discover_pdfs(tmp_path / "missing")


def test_insufficient_text_does_not_publish_partial_output(tmp_path: Path) -> None:
    pdf_path = _pdf(tmp_path / "empty.pdf")
    output = tmp_path / "out"

    extracted, skipped = extract_pdfs(
        pdf_path,
        output,
        min_text_chars=100,
        converter=FakeConverter(text="short"),
    )

    assert extracted == []
    assert len(skipped) == 1
    assert "insufficient text" in skipped[0].reason
    assert not output.exists()
    assert not list(tmp_path.glob(".out.tmp-*"))


def test_existing_output_requires_explicit_clean_replacement(tmp_path: Path) -> None:
    pdf_path = _pdf(tmp_path / "sample.pdf")
    output = tmp_path / "out"
    output.mkdir()
    (output / "stale.txt").write_text("stale", encoding="utf-8")

    with pytest.raises(FileExistsError, match="replace-output"):
        extract_pdfs(pdf_path, output, converter=FakeConverter())

    extracted, skipped = extract_pdfs(
        pdf_path,
        output,
        converter=FakeConverter(),
        replace_output=True,
    )

    assert len(extracted) == 1
    assert skipped == []
    assert not (output / "stale.txt").exists()
    assert (output / "sample.md").is_file()
    assert not list(tmp_path.glob(".out.backup-*"))


def test_partial_success_is_kept_with_warning(tmp_path: Path) -> None:
    pdf_path = _pdf(tmp_path / "partial.pdf")
    warning = SimpleNamespace(model_dump=lambda **_kwargs: {"message": "one page failed"})

    extracted, skipped = extract_pdfs(
        pdf_path,
        tmp_path / "out",
        converter=FakeConverter(status="partial_success", errors=[warning]),
    )

    assert skipped == []
    assert extracted[0].status == "partial_success"
    assert extracted[0].warnings == [{"message": "one page failed"}]


def test_settings_are_loaded_from_training_config(tmp_path: Path) -> None:
    config = tmp_path / "training.toml"
    config.write_text(
        """
[pdf_extraction]
device = "cpu"
ocr = false
formula_enrichment = false
image_scale = 1.5
document_timeout = 90
""".strip(),
        encoding="utf-8",
    )

    assert settings_from_config(config) == PdfExtractionSettings(
        engine="docling",
        device="cpu",
        enable_ocr=False,
        enable_formula_enrichment=False,
        image_scale=1.5,
        document_timeout=90.0,
    )


def test_cli_emits_structured_result(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from finetune_lora import pdf_extract

    pdf_path = _pdf(tmp_path / "sample.pdf")
    monkeypatch.setattr(pdf_extract, "build_converter", lambda _settings: FakeConverter())
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "pdf_extract",
            "--source",
            str(pdf_path),
            "--output",
            str(tmp_path / "out"),
        ],
    )

    pdf_extract.main()

    marker = next(
        line
        for line in capsys.readouterr().out.splitlines()
        if line.startswith("FINETUNE_RESULT_JSON=")
    )
    result = json.loads(marker.split("=", 1)[1])
    assert result["engine"] == "docling"
    assert result["documents"][0]["output_relative_path"] == "sample.md"
