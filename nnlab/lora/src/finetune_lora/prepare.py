from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .config import load_config, nested, resolve_path
from .scanner import SourceFile, language_for, scan_project


@dataclass(frozen=True)
class CodeChunk:
    project: str
    path: str
    start_line: int
    end_line: int
    content: str
    source_sha256: str


def chunk_source(source: SourceFile, chunk_lines: int, overlap_lines: int) -> Iterator[CodeChunk]:
    if chunk_lines < 2:
        raise ValueError("chunk_lines must be at least 2")
    if overlap_lines < 0 or overlap_lines >= chunk_lines:
        raise ValueError("overlap_lines must be >= 0 and smaller than chunk_lines")
    lines = source.text.splitlines(keepends=True)
    if not lines:
        return
    step = chunk_lines - overlap_lines
    for start in range(0, len(lines), step):
        selected = lines[start : start + chunk_lines]
        content = "".join(selected).rstrip()
        if content.strip():
            yield CodeChunk(
                project=source.project,
                path=source.relative_path,
                start_line=start + 1,
                end_line=start + len(selected),
                content=content,
                source_sha256=source.sha256,
            )
        if start + chunk_lines >= len(lines):
            break


def _is_validation(project: str, path: str, ratio: float, seed: int) -> bool:
    digest = hashlib.sha256(f"{seed}:{project}:{path}".encode()).digest()
    value = int.from_bytes(digest[:8], "big") / (2**64 - 1)
    return value < ratio


def _chunk_record(chunk: CodeChunk) -> dict[str, Any]:
    system = (
        "You are a coding assistant familiar with the repository snapshots supplied during "
        "training. Preserve exact APIs, naming, language, and project conventions. If the "
        "repository may have changed, say that retrieved current context takes precedence."
    )
    user = (
        f"Repository: {chunk.project}\n"
        f"File: {chunk.path}\n"
        f"Lines: {chunk.start_line}-{chunk.end_line}\n\n"
        "Reproduce this source section exactly as it exists in the repository snapshot."
    )
    completion = f"```{language_for(chunk.path)}\n{chunk.content}\n```"
    return {
        "prompt": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "completion": [{"role": "assistant", "content": completion}],
        "metadata": {
            "project": chunk.project,
            "path": chunk.path,
            "start_line": chunk.start_line,
            "end_line": chunk.end_line,
            "source_sha256": chunk.source_sha256,
            "task": "snapshot-recall",
        },
    }


def _continuation_record(chunk: CodeChunk) -> dict[str, Any] | None:
    lines = chunk.content.splitlines()
    if len(lines) < 8:
        return None
    split = max(2, len(lines) // 3)
    prefix = "\n".join(lines[:split])
    suffix = "\n".join(lines[split:])
    language = language_for(chunk.path)
    return {
        "prompt": [
            {
                "role": "system",
                "content": (
                    "Continue repository code exactly and preserve its APIs, naming, formatting, "
                    "and local conventions."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Repository: {chunk.project}\n"
                    f"File: {chunk.path}\n"
                    f"Continue this source section after the last shown line:\n"
                    f"```{language}\n{prefix}\n```"
                ),
            },
        ],
        "completion": [{"role": "assistant", "content": f"```{language}\n{suffix}\n```"}],
        "metadata": {
            "project": chunk.project,
            "path": chunk.path,
            "start_line": chunk.start_line + split,
            "end_line": chunk.end_line,
            "source_sha256": chunk.source_sha256,
            "task": "code-continuation",
        },
    }


def _tree_record(project: str, paths: list[str]) -> dict[str, Any]:
    return {
        "prompt": [
            {
                "role": "system",
                "content": "You are a coding assistant familiar with this repository snapshot.",
            },
            {
                "role": "user",
                "content": (
                    f"Repository: {project}\n"
                    "List the source files and configuration files in this repository snapshot."
                ),
            },
        ],
        "completion": [{"role": "assistant", "content": "\n".join(paths)}],
        "metadata": {"project": project, "path": "<repository-tree>"},
    }


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def prepare(
    projects: list[str | Path],
    train_path: Path,
    validation_path: Path,
    manifest_path: Path,
    *,
    chunk_lines: int,
    overlap_lines: int,
    max_file_bytes: int,
    validation_ratio: float,
    seed: int,
) -> dict[str, Any]:
    if not projects:
        raise ValueError("At least one project directory or source file is required")
    if not 0 <= validation_ratio < 1:
        raise ValueError("validation_ratio must be in [0, 1)")

    train_records: list[dict[str, Any]] = []
    validation_records: list[dict[str, Any]] = []
    manifest_projects: list[dict[str, Any]] = []

    for project_path in projects:
        sources, skipped = scan_project(project_path, max_file_bytes=max_file_bytes)
        if not sources:
            reasons = ", ".join(
                f"{item.relative_path}: {item.reason}" for item in skipped
            )
            detail = f" ({reasons})" if reasons else ""
            raise ValueError(
                f"No eligible source files found in {Path(project_path).resolve()}{detail}"
            )
        project = sources[0].project
        paths = [source.relative_path for source in sources]
        project_train = 0
        project_validation = 0
        validation_paths = {
            source.relative_path
            for source in sources
            if _is_validation(project, source.relative_path, validation_ratio, seed)
        }
        if len(validation_paths) == len(sources):
            validation_paths.remove(sources[0].relative_path)
        for source in sources:
            target = (
                validation_records
                if source.relative_path in validation_paths
                else train_records
            )
            for chunk in chunk_source(source, chunk_lines, overlap_lines):
                records = [_chunk_record(chunk)]
                continuation = _continuation_record(chunk)
                if continuation:
                    records.append(continuation)
                target.extend(records)
                if target is validation_records:
                    project_validation += len(records)
                else:
                    project_train += len(records)
        train_records.append(_tree_record(project, paths))
        project_train += 1
        manifest_projects.append(
            {
                "name": project,
                "root": str(sources[0].root),
                "included_files": len(sources),
                "skipped_files": [asdict(item) for item in skipped],
                "train_records": project_train,
                "validation_records": project_validation,
                "files": [
                    {"path": item.relative_path, "sha256": item.sha256} for item in sources
                ],
            }
        )

    rng = random.Random(seed)
    rng.shuffle(train_records)
    rng.shuffle(validation_records)
    _write_jsonl(train_path, train_records)
    _write_jsonl(validation_path, validation_records)
    manifest = {
        "format": 1,
        "projects": manifest_projects,
        "train_records": len(train_records),
        "validation_records": len(validation_records),
        "settings": {
            "chunk_lines": chunk_lines,
            "overlap_lines": overlap_lines,
            "max_file_bytes": max_file_bytes,
            "validation_ratio": validation_ratio,
            "seed": seed,
        },
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create safe fine-tuning data from project directories or source files"
    )
    parser.add_argument("--config", required=True)
    parser.add_argument(
        "--project",
        "--input",
        dest="project",
        action="append",
        required=True,
        help="Project directory or individual source file; repeatable",
    )
    parser.add_argument("--train-file")
    parser.add_argument("--validation-file")
    parser.add_argument("--manifest-file")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = load_config(args.config)
    train_path = resolve_path(args.train_file or nested(config, "data", "train_file"))
    validation_path = resolve_path(
        args.validation_file or nested(config, "data", "validation_file")
    )
    manifest_path = resolve_path(args.manifest_file or nested(config, "data", "manifest_file"))
    manifest = prepare(
        args.project,
        train_path,
        validation_path,
        manifest_path,
        chunk_lines=int(nested(config, "data", "chunk_lines", 140)),
        overlap_lines=int(nested(config, "data", "overlap_lines", 20)),
        max_file_bytes=int(nested(config, "data", "max_file_bytes", 1_000_000)),
        validation_ratio=float(nested(config, "data", "validation_ratio", 0.1)),
        seed=int(nested(config, "data", "seed", 42)),
    )
    print(
        f"Wrote {manifest['train_records']} training and "
        f"{manifest['validation_records']} validation records."
    )


if __name__ == "__main__":
    main()
