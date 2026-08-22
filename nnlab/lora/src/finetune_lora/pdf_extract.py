from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import time
import uuid
from collections import Counter
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

from .config import load_config, nested

RESULT_MARKER = "FINETUNE_RESULT_JSON="
SUPPORTED_STATUSES = {"success", "partial_success"}


@dataclass(frozen=True)
class PdfExtractionSettings:
    engine: str = "docling"
    artifacts_path: str = "~/.cache/docling/models"
    device: str = "auto"
    enable_ocr: bool = True
    enable_formula_enrichment: bool = True
    image_scale: float = 2.0
    document_timeout: float | None = 600.0

    def validate(self) -> PdfExtractionSettings:
        if self.engine != "docling":
            raise ValueError("PDF extraction engine must be docling")
        if not self.artifacts_path.strip():
            raise ValueError("PDF extraction artifacts_path must not be empty")
        if self.device not in {"auto", "cpu", "mps", "cuda"}:
            raise ValueError("PDF extraction device must be auto, cpu, mps, or cuda")
        if self.image_scale <= 0:
            raise ValueError("PDF extraction image_scale must be greater than zero")
        if self.document_timeout is not None and self.document_timeout <= 0:
            raise ValueError("PDF extraction document_timeout must be greater than zero")
        return self


@dataclass(frozen=True)
class ExtractedPdf:
    source: Path
    relative_path: str
    materialized_path: Path
    output_relative_path: str
    artifacts_path: Path
    sha256: str
    pages: int
    characters: int
    status: str
    item_counts: dict[str, int]
    warnings: list[dict[str, Any]]
    conversion_seconds: float


@dataclass(frozen=True)
class SkippedPdf:
    source: Path
    relative_path: str
    reason: str


def _docling_version() -> str:
    try:
        return version("docling")
    except PackageNotFoundError:
        return "unavailable"


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


def _record(item: ExtractedPdf | SkippedPdf) -> dict[str, Any]:
    record = asdict(item)
    for key, value in list(record.items()):
        if isinstance(value, Path):
            record[key] = str(value)
    return record


def discover_pdfs(source: str | Path) -> tuple[Path, list[Path]]:
    requested = Path(source).expanduser()
    if requested.is_symlink():
        raise ValueError(f"PDF source must not be a symbolic link: {requested}")
    source_path = requested.resolve()
    if source_path.is_file():
        if source_path.suffix.casefold() != ".pdf":
            raise ValueError(f"Source file is not a PDF: {source_path}")
        return source_path.parent, [source_path]
    if not source_path.is_dir():
        raise FileNotFoundError(f"PDF source does not exist: {source_path}")
    pdfs = sorted(
        path.resolve()
        for path in source_path.rglob("*")
        if path.is_file() and not path.is_symlink() and path.suffix.casefold() == ".pdf"
    )
    if not pdfs:
        raise ValueError(f"No PDF files found under {source_path}")
    return source_path, pdfs


def settings_from_config(config_path: str | Path | None) -> PdfExtractionSettings:
    if not config_path:
        return PdfExtractionSettings()
    config = load_config(config_path)
    timeout = nested(config, "pdf_extraction", "document_timeout", 600.0)
    return PdfExtractionSettings(
        engine=str(nested(config, "pdf_extraction", "engine", "docling")),
        artifacts_path=str(
            nested(
                config,
                "pdf_extraction",
                "artifacts_path",
                "~/.cache/docling/models",
            )
        ),
        device=str(nested(config, "pdf_extraction", "device", "cpu")),
        enable_ocr=bool(nested(config, "pdf_extraction", "ocr", True)),
        enable_formula_enrichment=bool(
            nested(config, "pdf_extraction", "formula_enrichment", True)
        ),
        image_scale=float(nested(config, "pdf_extraction", "image_scale", 2.0)),
        document_timeout=None if timeout is None else float(timeout),
    ).validate()


def build_converter(settings: PdfExtractionSettings) -> Any:
    try:
        from docling.datamodel.accelerator_options import (
            AcceleratorDevice,
            AcceleratorOptions,
        )
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
    except ImportError as error:
        raise RuntimeError(
            "Docling is required for PDF extraction. Run scripts/setup.sh to install "
            "the documentation dependencies."
        ) from error

    try:
        device = AcceleratorDevice(settings.device)
    except ValueError as error:
        raise ValueError(f"Unsupported Docling accelerator: {settings.device}") from error

    artifacts_path = Path(settings.artifacts_path).expanduser().resolve()
    if not artifacts_path.is_dir():
        raise FileNotFoundError(
            f"Docling model artifacts are missing: {artifacts_path}. "
            "Run scripts/setup.sh to prefetch the offline model set."
        )

    options = PdfPipelineOptions(
        artifacts_path=artifacts_path,
        accelerator_options=AcceleratorOptions(device=device),
        do_ocr=settings.enable_ocr,
        do_table_structure=True,
        do_formula_enrichment=settings.enable_formula_enrichment,
        generate_picture_images=True,
        generate_page_images=False,
        images_scale=settings.image_scale,
        document_timeout=settings.document_timeout,
    )
    options.heading_hierarchy_options.enabled = True
    return DocumentConverter(
        allowed_formats=[InputFormat.PDF],
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)},
    )


def _publish_directory(staging: Path, output: Path, replace_output: bool) -> None:
    if output.exists() and not replace_output:
        raise FileExistsError(
            f"PDF output already exists: {output}. Use --replace-output for a clean replacement."
        )
    backup: Path | None = None
    if output.exists():
        backup = output.with_name(f".{output.name}.backup-{uuid.uuid4().hex}")
        os.replace(output, backup)
    try:
        os.replace(staging, output)
    except BaseException:
        if backup is not None and backup.exists() and not output.exists():
            os.replace(backup, output)
        raise
    if backup is not None:
        shutil.rmtree(backup)


def extract_pdfs(
    source: str | Path,
    output_dir: str | Path,
    *,
    min_text_chars: int = 20,
    settings: PdfExtractionSettings | None = None,
    replace_output: bool = False,
    converter: Any | None = None,
) -> tuple[list[ExtractedPdf], list[SkippedPdf]]:
    """Convert PDFs to layout-aware Markdown and referenced picture artifacts."""
    root, pdf_files = discover_pdfs(source)
    requested_output = Path(output_dir).expanduser()
    if requested_output.is_symlink():
        raise ValueError(f"PDF output must not be a symbolic link: {requested_output}")
    output_path = requested_output.resolve()
    if output_path.exists() and not output_path.is_dir():
        raise ValueError(f"PDF output must be a directory path: {output_path}")
    if min_text_chars < 0:
        raise ValueError("min_text_chars must not be negative")
    source_path = Path(source).expanduser().resolve()
    if source_path.is_dir() and output_path.is_relative_to(source_path):
        raise ValueError("PDF output must not be inside the source directory")
    if output_path.exists() and not replace_output:
        raise FileExistsError(
            f"PDF output already exists: {output_path}. Use --replace-output for a clean replacement."
        )

    selected_settings = (settings or PdfExtractionSettings()).validate()
    selected_converter = converter or build_converter(selected_settings)
    try:
        from docling_core.types.doc import ImageRefMode
    except ImportError as error:
        raise RuntimeError("Docling Core is required for Markdown image export") from error

    output_path.parent.mkdir(parents=True, exist_ok=True)
    staging = output_path.with_name(f".{output_path.name}.tmp-{uuid.uuid4().hex}")
    staging.mkdir()
    extracted: list[ExtractedPdf] = []
    skipped: list[SkippedPdf] = []
    output_names: set[str] = set()

    try:
        for pdf_file in pdf_files:
            relative = pdf_file.relative_to(root)
            output_relative = relative.with_suffix(".md")
            output_key = output_relative.as_posix().casefold()
            if output_key in output_names:
                skipped.append(
                    SkippedPdf(pdf_file, relative.as_posix(), "case-insensitive output collision")
                )
                continue
            output_names.add(output_key)
            staged_markdown = staging / output_relative
            staged_markdown.parent.mkdir(parents=True, exist_ok=True)
            artifacts_name = f"{staged_markdown.stem}_artifacts"
            staged_artifacts = staged_markdown.parent / artifacts_name
            started = time.monotonic()
            try:
                result = selected_converter.convert(pdf_file, raises_on_error=False)
                status = getattr(result.status, "value", str(result.status)).casefold()
                errors = _error_records(getattr(result, "errors", []))
                if status not in SUPPORTED_STATUSES:
                    raise RuntimeError(
                        f"Docling returned status {status}: "
                        f"{json.dumps(errors, ensure_ascii=False)}"
                    )
                document = result.document
                plain_text = document.export_to_text()
                if len(plain_text.strip()) < min_text_chars:
                    raise ValueError("insufficient text extracted")
                document.save_as_markdown(
                    staged_markdown,
                    artifacts_dir=Path(artifacts_name),
                    image_mode=ImageRefMode.REFERENCED,
                    page_break_placeholder="<!-- page-break -->",
                    include_annotations=True,
                )
                final_markdown = output_path / output_relative
                final_artifacts = final_markdown.parent / artifacts_name
                extracted.append(
                    ExtractedPdf(
                        source=pdf_file,
                        relative_path=relative.as_posix(),
                        materialized_path=final_markdown,
                        output_relative_path=output_relative.as_posix(),
                        artifacts_path=final_artifacts,
                        sha256=_sha256(pdf_file),
                        pages=len(document.pages),
                        characters=len(plain_text),
                        status=status,
                        item_counts=_item_counts(document),
                        warnings=errors,
                        conversion_seconds=round(time.monotonic() - started, 3),
                    )
                )
            except Exception as error:  # noqa: BLE001 - isolate per-document failures
                if staged_markdown.exists():
                    staged_markdown.unlink()
                if staged_artifacts.exists():
                    shutil.rmtree(staged_artifacts)
                skipped.append(SkippedPdf(pdf_file, relative.as_posix(), str(error)))

        if extracted:
            _publish_directory(staging, output_path, replace_output)
        else:
            shutil.rmtree(staging)
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    return extracted, skipped


def _write_manifest(
    path: str | Path,
    *,
    source: str | Path,
    output_dir: str | Path,
    settings: PdfExtractionSettings,
    extracted: list[ExtractedPdf],
    skipped: list[SkippedPdf],
) -> None:
    manifest_path = Path(path).expanduser().resolve()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "format": 2,
        "engine": "docling",
        "docling_version": _docling_version(),
        "source": str(Path(source).expanduser().resolve()),
        "output_dir": str(Path(output_dir).expanduser().resolve()),
        "settings": asdict(settings),
        "extracted": [_record(item) for item in extracted],
        "skipped": [_record(item) for item in skipped],
    }
    temporary = manifest_path.with_name(f".{manifest_path.name}.tmp-{uuid.uuid4().hex}")
    temporary.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, manifest_path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert PDF documentation to layout-aware Markdown with Docling"
    )
    parser.add_argument("--source", required=True, help="PDF file or directory containing PDFs")
    parser.add_argument("--output", dest="output_dir", required=True)
    parser.add_argument("--config", help="Optional training TOML with [pdf_extraction] settings")
    parser.add_argument("--manifest", help="Optional JSON manifest path")
    parser.add_argument("--min-text-chars", type=int, default=20)
    parser.add_argument("--device", choices=("auto", "cpu", "mps", "cuda"))
    parser.add_argument("--ocr", action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument(
        "--formula-enrichment",
        action=argparse.BooleanOptionalAction,
        default=None,
    )
    parser.add_argument("--image-scale", type=float)
    parser.add_argument("--document-timeout", type=float)
    parser.add_argument("--replace-output", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    configured = settings_from_config(args.config)
    settings = PdfExtractionSettings(
        engine=configured.engine,
        artifacts_path=configured.artifacts_path,
        device=args.device or configured.device,
        enable_ocr=configured.enable_ocr if args.ocr is None else args.ocr,
        enable_formula_enrichment=(
            configured.enable_formula_enrichment
            if args.formula_enrichment is None
            else args.formula_enrichment
        ),
        image_scale=args.image_scale or configured.image_scale,
        document_timeout=(
            configured.document_timeout if args.document_timeout is None else args.document_timeout
        ),
    ).validate()
    extracted, skipped = extract_pdfs(
        args.source,
        args.output_dir,
        min_text_chars=args.min_text_chars,
        settings=settings,
        replace_output=args.replace_output,
    )
    if args.manifest:
        _write_manifest(
            args.manifest,
            source=args.source,
            output_dir=args.output_dir,
            settings=settings,
            extracted=extracted,
            skipped=skipped,
        )
    print(
        f"Docling extracted {len(extracted)} PDFs to "
        f"{Path(args.output_dir).expanduser().resolve()}; skipped {len(skipped)}."
    )
    for item in skipped:
        print(f"Skipped {item.relative_path}: {item.reason}", file=sys.stderr)
    result = {
        "operation": "pdfExtraction",
        "engine": "docling",
        "doclingVersion": _docling_version(),
        "outputDirectory": str(Path(args.output_dir).expanduser().resolve()),
        "documents": [_record(item) for item in extracted],
        "skipped": [_record(item) for item in skipped],
    }
    print(RESULT_MARKER + json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    if not extracted:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
