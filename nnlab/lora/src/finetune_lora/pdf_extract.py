from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from pypdf import PdfReader


@dataclass(frozen=True)
class ExtractedPdf:
    source: Path
    relative_path: str
    text_path: Path
    sha256: str
    pages: int


@dataclass(frozen=True)
class SkippedPdf:
    source: Path
    relative_path: str
    reason: str


def _pdf_text(path: Path) -> tuple[str, int]:
    reader = PdfReader(str(path))
    page_texts: list[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text()
        except Exception:  # noqa: BLE001 - extraction can raise varied exceptions
            text = ""
        page_texts.append(text or "")
    return "\n\n".join(page_texts), len(reader.pages)


def _normalize_text(text: str) -> str:
    # Collapse excessive whitespace while preserving paragraph breaks.
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    return "\n\n".join(paragraphs)


def _manifest_record(item: Any) -> dict[str, Any]:
    """Convert dataclass to dict with Path values rendered as strings."""
    record: dict[str, Any] = asdict(item)
    for key, value in list(record.items()):
        if isinstance(value, Path):
            record[key] = str(value)
    return record


def extract_pdfs(
    source: str | Path,
    output_dir: str | Path,
    *,
    suffix: str = ".txt",
    min_text_chars: int = 20,
) -> tuple[list[ExtractedPdf], list[SkippedPdf]]:
    """Extract text from all PDFs under *source* into *output_dir*.

    Directory structure is preserved. Files that cannot be read or contain too
    little text are reported as skipped.
    """
    source_path = Path(source).expanduser().resolve()
    output_path = Path(output_dir).expanduser().resolve()
    output_path.mkdir(parents=True, exist_ok=True)

    if source_path.is_file():
        if source_path.suffix.lower() != ".pdf":
            raise ValueError(f"Source file is not a PDF: {source_path}")
        pdf_files = [source_path]
        root = source_path.parent
    else:
        root = source_path
        pdf_files = sorted(root.rglob("*.pdf"))

    extracted: list[ExtractedPdf] = []
    skipped: list[SkippedPdf] = []

    for pdf_file in pdf_files:
        relative = pdf_file.relative_to(root)
        text_file = output_path / relative.with_suffix(suffix)
        try:
            raw = pdf_file.read_bytes()
            text, pages = _pdf_text(pdf_file)
            text = _normalize_text(text)
            if len(text) < min_text_chars:
                skipped.append(
                    SkippedPdf(pdf_file, relative.as_posix(), "insufficient text extracted")
                )
                continue
            text_file.parent.mkdir(parents=True, exist_ok=True)
            text_file.write_text(text, encoding="utf-8")
            extracted.append(
                ExtractedPdf(
                    source=pdf_file,
                    relative_path=relative.as_posix(),
                    text_path=text_file,
                    sha256=hashlib.sha256(raw).hexdigest(),
                    pages=pages,
                )
            )
        except Exception as error:  # noqa: BLE001 - graceful per-file failure
            skipped.append(SkippedPdf(pdf_file, relative.as_posix(), str(error)))

    return extracted, skipped


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract text from user-selected PDF documentation for training"
    )
    parser.add_argument(
        "--source",
        required=True,
        help="PDF file or directory containing PDFs",
    )
    parser.add_argument(
        "--output",
        dest="output_dir",
        required=True,
        help="Directory to write extracted .txt files",
    )
    parser.add_argument(
        "--manifest",
        help="Optional JSON manifest path",
    )
    parser.add_argument(
        "--min-text-chars",
        type=int,
        default=20,
        help="Minimum characters of extracted text to keep a file",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    extracted, skipped = extract_pdfs(
        args.source,
        args.output_dir,
        min_text_chars=args.min_text_chars,
    )
    print(
        f"Extracted {len(extracted)} PDFs to {Path(args.output_dir).resolve()}; "
        f"skipped {len(skipped)}."
    )
    if args.manifest:
        manifest_path = Path(args.manifest)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest = {
            "source": str(Path(args.source).resolve()),
            "output_dir": str(Path(args.output_dir).resolve()),
            "extracted": [_manifest_record(item) for item in extracted],
            "skipped": [_manifest_record(item) for item in skipped],
        }
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        print(f"Wrote manifest to {manifest_path}")


if __name__ == "__main__":
    main()
