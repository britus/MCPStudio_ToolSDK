from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import time
import uuid
from collections import Counter
from collections.abc import Iterable
from importlib.metadata import version
from pathlib import Path
from typing import Any

DEFAULT_OUTPUT = Path("data/prepared_docs/poc-docling-output")


def discover_pdfs(inputs: Iterable[str | Path]) -> list[Path]:
    """Resolve PDF files from explicit files and recursively scanned directories."""
    discovered: dict[Path, None] = {}
    for value in inputs:
        path = Path(value).expanduser().resolve()
        if path.is_file():
            if path.suffix.casefold() != ".pdf":
                raise ValueError(f"Input file is not a PDF: {path}")
            discovered[path] = None
            continue
        if not path.is_dir():
            raise FileNotFoundError(f"Input does not exist: {path}")
        for candidate in sorted(path.rglob("*")):
            if candidate.is_file() and candidate.suffix.casefold() == ".pdf":
                discovered[candidate.resolve()] = None
    if not discovered:
        raise ValueError("No PDF inputs found")
    return list(discovered)


def ensure_new_output(output: str | Path) -> Path:
    """Require a fresh output directory so PoC evidence is never mixed across runs."""
    path = Path(output).expanduser().resolve()
    if path.exists():
        raise FileExistsError(
            f"Docling PoC output already exists: {path}. Move or remove it before rerunning."
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _item_counts(document: Any) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for item, _level in document.iterate_items():
        label = getattr(item, "label", None)
        name = getattr(label, "value", None) or str(label or type(item).__name__)
        counts[str(name)] += 1
    return dict(sorted(counts.items()))


def _error_records(errors: Iterable[Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for error in errors:
        if hasattr(error, "model_dump"):
            records.append(error.model_dump(mode="json"))
        else:
            records.append({"message": str(error)})
    return records


def run_docling_poc(
    inputs: Iterable[str | Path],
    output: str | Path = DEFAULT_OUTPUT,
    *,
    device: str = "auto",
    enable_ocr: bool = True,
    document_timeout: float | None = None,
) -> Path:
    """Convert PDFs with Docling and publish a structured, inspectable PoC bundle."""
    from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.document import ConversionStatus
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling_core.types.doc import ImageRefMode

    pdfs = discover_pdfs(inputs)
    output_path = ensure_new_output(output)
    staging = output_path.with_name(f".{output_path.name}.tmp-{uuid.uuid4().hex}")
    staging.mkdir(parents=True)

    try:
        accelerator_device = AcceleratorDevice(device)
    except ValueError as error:
        allowed = ", ".join(item.value for item in AcceleratorDevice)
        raise ValueError(f"Unsupported device {device!r}; choose one of: {allowed}") from error

    pipeline_options = PdfPipelineOptions(
        accelerator_options=AcceleratorOptions(device=accelerator_device),
        do_ocr=enable_ocr,
        do_table_structure=True,
        generate_page_images=True,
        generate_picture_images=True,
        images_scale=2.0,
        document_timeout=document_timeout,
    )
    converter = DocumentConverter(
        allowed_formats=[InputFormat.PDF],
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)},
    )
    manifest: dict[str, Any] = {
        "format": 1,
        "docling_version": version("docling"),
        "output": str(output_path),
        "settings": {
            "device": accelerator_device.value,
            "ocr": enable_ocr,
            "table_structure": True,
            "table_mode": str(pipeline_options.table_structure_options.mode.value),
            "images_scale": pipeline_options.images_scale,
            "document_timeout": document_timeout,
        },
        "documents": [],
    }

    try:
        for index, source in enumerate(pdfs, start=1):
            target = staging / f"document-{index:03d}-{source.stem}"
            target.mkdir()
            started = time.monotonic()
            result = converter.convert(source, raises_on_error=False)
            elapsed = time.monotonic() - started
            if result.status != ConversionStatus.SUCCESS:
                raise RuntimeError(
                    f"Docling conversion failed for {source}: {_error_records(result.errors)}"
                )

            document = result.document
            artifacts_dir = Path("document_artifacts")
            document.save_as_markdown(
                target / "document.md",
                artifacts_dir=artifacts_dir,
                image_mode=ImageRefMode.REFERENCED,
            )
            document.save_as_json(
                target / "document.json",
                artifacts_dir=artifacts_dir,
                image_mode=ImageRefMode.REFERENCED,
            )
            document.save_as_html(
                target / "document.html",
                artifacts_dir=artifacts_dir,
                image_mode=ImageRefMode.REFERENCED,
                split_page_view=True,
            )
            (target / "document.txt").write_text(
                document.export_to_text() + "\n",
                encoding="utf-8",
            )
            manifest["documents"].append(
                {
                    "source": str(source),
                    "source_sha256": _sha256(source),
                    "output_directory": target.name,
                    "pages": len(document.pages),
                    "item_counts": _item_counts(document),
                    "conversion_seconds": round(elapsed, 3),
                    "warnings": _error_records(result.errors),
                }
            )

        (staging / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        os.replace(staging, output_path)
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    return output_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run an isolated Docling PDF extraction PoC with inspectable outputs"
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        help="PDF files or directories recursively containing PDFs",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Fresh output directory (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--device",
        choices=("auto", "cpu", "mps"),
        default="auto",
        help="Docling accelerator selection",
    )
    parser.add_argument(
        "--no-ocr",
        action="store_true",
        help="Disable OCR and use only the PDF text layer",
    )
    parser.add_argument(
        "--document-timeout",
        type=float,
        help="Optional per-document timeout in seconds",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    output = run_docling_poc(
        args.inputs,
        args.output,
        device=args.device,
        enable_ocr=not args.no_ocr,
        document_timeout=args.document_timeout,
    )
    print(f"Docling PoC output written to {output}")


if __name__ == "__main__":
    main()
