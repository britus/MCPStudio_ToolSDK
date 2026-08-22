from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import re
from collections import Counter, defaultdict
from collections.abc import Iterator
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .config import load_config, nested, resolve_path
from .output_cleanup import reset_generated_directory
from .prepare import CodeChunk, chunk_source
from .scanner import SourceFile, scan_project


def _document_reproduction_record(
    chunk: CodeChunk, document_type: str
) -> dict[str, Any]:
    system = (
        f"You are a technical assistant familiar with the {document_type} "
        "documentation supplied during training. Reproduce technical content exactly, "
        "preserve names, values, identifiers, syntax, structure, and procedures. "
        "If the document may have changed, say that the authoritative manual takes precedence."
    )
    user = (
        f"Document: {chunk.project}/{chunk.path}\n"
        f"Lines: {chunk.start_line}-{chunk.end_line}\n\n"
        "Reproduce this document section exactly as it appears in the source material."
    )
    return {
        "prompt": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "completion": [{"role": "assistant", "content": chunk.content}],
        "metadata": {
            "project": chunk.project,
            "path": chunk.path,
            "start_line": chunk.start_line,
            "end_line": chunk.end_line,
            "source_sha256": chunk.source_sha256,
            "task": "document-reproduction",
        },
    }


def _document_continuation_record(
    chunk: CodeChunk, document_type: str
) -> dict[str, Any] | None:
    lines = chunk.content.splitlines()
    if len(lines) < 8:
        return None
    split = max(2, len(lines) // 3)
    if Path(chunk.path).suffix.casefold() == ".md":
        split = _markdown_continuation_split(lines, split)
    prefix = "\n".join(lines[:split])
    suffix = "\n".join(lines[split:])
    return {
        "prompt": [
            {
                "role": "system",
                "content": (
                    f"Continue the {document_type} documentation exactly, preserving technical "
                    "terms, identifiers, values, structure, and formatting."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Document: {chunk.project}/{chunk.path}\n"
                    "Continue this document section after the last shown line:\n\n"
                    f"{prefix}"
                ),
            },
        ],
        "completion": [{"role": "assistant", "content": suffix}],
        "metadata": {
            "project": chunk.project,
            "path": chunk.path,
            "start_line": chunk.start_line + split,
            "end_line": chunk.end_line,
            "source_sha256": chunk.source_sha256,
            "task": "document-continuation",
        },
    }


def _document_tree_record(project: str, paths: list[str], document_type: str) -> dict[str, Any]:
    return {
        "prompt": [
            {
                "role": "system",
                "content": (
                    f"You are a technical assistant familiar with the {document_type} "
                    "documentation collection."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Document collection: {project}\n"
                    "List the documents in this collection."
                ),
            },
        ],
        "completion": [{"role": "assistant", "content": "\n".join(paths)}],
        "metadata": {"project": project, "path": "<document-collection-tree>"},
    }


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def _validate_policy(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError("Dataset policy must be a JSON object")
    required = value.get("requiredSubjects", [])
    if not isinstance(required, list) or not required or not all(
        isinstance(item, str) and item.strip() for item in required
    ):
        raise ValueError("requiredSubjects must be a non-empty array of strings")
    required_subjects = {item.strip() for item in required}
    sources = value.get("sources", [])
    if not isinstance(sources, list) or not sources:
        raise ValueError("sources must be a non-empty array")
    covered_subjects: set[str] = set()
    policy_format = value.get("format", 1)
    if not isinstance(policy_format, int) or policy_format < 1:
        raise ValueError("format must be a positive integer")
    for index, source in enumerate(sources):
        if not isinstance(source, dict) or not isinstance(source.get("path"), str):
            raise TypeError(f"sources[{index}].path must be a string")
        subjects = source.get("subjects", [])
        if not isinstance(subjects, list) or not subjects or not all(
            isinstance(item, str) and item.strip() for item in subjects
        ):
            raise ValueError(
                f"sources[{index}].subjects must be a non-empty array of strings"
            )
        normalized_subjects = {item.strip() for item in subjects}
        unknown_subjects = normalized_subjects - required_subjects
        if unknown_subjects:
            raise ValueError(
                f"sources[{index}].subjects contains values not listed in "
                f"requiredSubjects: {', '.join(sorted(unknown_subjects))}"
            )
        covered_subjects.update(normalized_subjects)
        if policy_format >= 2:
            evidence = source.get("subjectEvidence")
            if not isinstance(evidence, dict):
                raise TypeError(
                    f"sources[{index}].subjectEvidence must be an object"
                )
            missing_evidence = normalized_subjects - set(evidence)
            unknown_evidence = set(evidence) - normalized_subjects
            if missing_evidence or unknown_evidence:
                details = []
                if missing_evidence:
                    details.append("missing " + ", ".join(sorted(missing_evidence)))
                if unknown_evidence:
                    details.append("unknown " + ", ".join(sorted(unknown_evidence)))
                raise ValueError(
                    f"sources[{index}].subjectEvidence keys must match subjects "
                    f"({'; '.join(details)})"
                )
            for subject, markers in evidence.items():
                selected = [markers] if isinstance(markers, str) else markers
                if not isinstance(selected, list) or not selected or not all(
                    isinstance(marker, str) and marker.strip() for marker in selected
                ):
                    raise ValueError(
                        f"sources[{index}].subjectEvidence[{subject!r}] must be a "
                        "non-empty string or array of strings"
                    )
    missing_subjects = required_subjects - covered_subjects
    if missing_subjects:
        raise ValueError(
            "Dataset policy does not cover requiredSubjects: "
            + ", ".join(sorted(missing_subjects))
        )
    return value


def _load_policy(path: str | Path | None) -> dict[str, Any] | None:
    if not path:
        return None
    value = json.loads(Path(path).expanduser().resolve().read_text(encoding="utf-8"))
    return _validate_policy(value)


def _policy_source_map(policy: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not policy:
        return {}
    result: dict[str, dict[str, Any]] = {}
    evidence_bound = int(policy.get("format", 1)) >= 2
    for item in policy["sources"]:
        key = Path(item["path"]).as_posix().lstrip("./")
        subjects = sorted(
            {value.strip() for value in item["subjects"] if value.strip()}
        )
        subject_evidence: dict[str, list[str]] = {}
        if evidence_bound:
            for subject, markers in item["subjectEvidence"].items():
                selected = [markers] if isinstance(markers, str) else markers
                subject_evidence[subject] = [marker.strip() for marker in selected]
        result[key] = {
            "subjects": subjects,
            "subject_evidence": subject_evidence,
            "evidence_bound": evidence_bound,
        }
    return result


def _normalized_evidence_text(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold()))


def _subjects_for_chunk(chunk: CodeChunk, source_policy: dict[str, Any]) -> list[str]:
    """Assign only subjects whose direct evidence occurs in this chunk."""
    subjects = list(source_policy.get("subjects", []))
    if not source_policy.get("evidence_bound"):
        return subjects
    content = _normalized_evidence_text(chunk.content)
    evidence = source_policy.get("subject_evidence", {})
    return sorted(
        subject
        for subject in subjects
        if any(
            marker_text and marker_text in content
            for marker_text in (
                _normalized_evidence_text(marker)
                for marker in evidence.get(subject, [])
            )
        )
    )


_EXCLUDED_TRAINING_SECTIONS = {"related parts"}


def _excluded_training_section(chunk: CodeChunk) -> str | None:
    """Identify catalogue-style sections that describe other products, not the source."""
    for line in chunk.content.splitlines():
        match = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$", line)
        if not match:
            continue
        heading = _normalized_evidence_text(match.group(1))
        if heading in _EXCLUDED_TRAINING_SECTIONS:
            return heading
    return None


def _records_for_chunk(
    chunk: CodeChunk,
    document_type: str,
    subjects: list[str],
) -> list[dict[str, Any]]:
    records = [_document_reproduction_record(chunk, document_type)]
    continuation = _document_continuation_record(chunk, document_type)
    if continuation:
        records.append(continuation)
    primary = next(
        (
            subject
            for subject in subjects
            if "-common-" not in subject and not subject.endswith("-procedures")
        ),
        subjects[0] if subjects else "unclassified",
    )
    for record in records:
        record["metadata"]["subjects"] = subjects
        record["metadata"]["primary_subject"] = primary
        record["metadata"]["source_key"] = f"{chunk.project}/{chunk.path}"
    return records


def _markdown_table_line(line: str) -> bool:
    stripped = line.strip()
    return stripped.startswith("|") and stripped.endswith("|")


def _markdown_fence_start(lines: list[str], index: int) -> int | None:
    in_fence = False
    start: int | None = None
    for position, line in enumerate(lines[: index + 1]):
        if line.lstrip().startswith("```"):
            if in_fence:
                in_fence = False
                start = None
            else:
                in_fence = True
                start = position
    return start if in_fence else None


def _markdown_continuation_split(lines: list[str], preferred: int) -> int:
    """Move a prompt/completion boundary outside Markdown tables and fences."""
    split = min(max(2, preferred), len(lines) - 1)
    if _markdown_table_line(lines[split - 1]) and _markdown_table_line(lines[split]):
        table_start = split
        while table_start > 0 and _markdown_table_line(lines[table_start - 1]):
            table_start -= 1
        table_end = split
        while table_end < len(lines) and _markdown_table_line(lines[table_end]):
            table_end += 1
        split = table_start if table_start >= 2 else table_end

    fence_start = _markdown_fence_start(lines, split - 1)
    if fence_start is not None:
        fence_end = split
        while fence_end < len(lines):
            if lines[fence_end].lstrip().startswith("```"):
                fence_end += 1
                break
            fence_end += 1
        split = fence_start if fence_start >= 2 else fence_end
    return min(max(2, split), len(lines) - 1)


def _markdown_safe_end(lines: list[str], start: int, target: int) -> int:
    if target >= len(lines):
        return len(lines)

    if _markdown_table_line(lines[target - 1]) and _markdown_table_line(lines[target]):
        end = target
        while end < len(lines) and _markdown_table_line(lines[end]):
            end += 1
        return end

    fence_start = _markdown_fence_start(lines, target - 1)
    if fence_start is not None and fence_start >= start:
        end = target
        while end < len(lines):
            if lines[end].lstrip().startswith("```"):
                return end + 1
            end += 1
        return len(lines)

    search_floor = max(start + 1, target - max(12, (target - start) // 3))
    for boundary in range(target, search_floor - 1, -1):
        if lines[boundary].lstrip().startswith("#") or not lines[boundary - 1].strip():
            return boundary
    return target


def _markdown_overlap_start(
    lines: list[str], start: int, end: int, overlap: int
) -> int:
    desired = max(start + 1, end - overlap)
    if desired >= end:
        return end
    if _markdown_table_line(lines[desired]):
        while desired > start and _markdown_table_line(lines[desired - 1]):
            desired -= 1
    fence_start = _markdown_fence_start(lines, desired)
    if fence_start is not None:
        desired = fence_start
    return desired if desired > start else end


def chunk_document_source(
    source: SourceFile,
    chunk_lines: int,
    overlap_lines: int,
) -> Iterator[CodeChunk]:
    """Chunk Markdown at safe boundaries without splitting tables or fenced blocks."""
    if source.path.suffix.casefold() != ".md":
        yield from chunk_source(source, chunk_lines, overlap_lines)
        return
    if chunk_lines < 2:
        raise ValueError("chunk_lines must be at least 2")
    if overlap_lines < 0 or overlap_lines >= chunk_lines:
        raise ValueError("overlap_lines must be >= 0 and smaller than chunk_lines")

    lines = source.text.splitlines(keepends=True)
    start = 0
    while start < len(lines):
        target = min(start + chunk_lines, len(lines))
        end = _markdown_safe_end(lines, start, target)
        content = "".join(lines[start:end]).rstrip()
        if content.strip():
            yield CodeChunk(
                project=source.project,
                path=source.relative_path,
                start_line=start + 1,
                end_line=end,
                content=content,
                source_sha256=source.sha256,
            )
        if end >= len(lines):
            break
        start = _markdown_overlap_start(lines, start, end, overlap_lines)


def _overlaps(left: CodeChunk, right: CodeChunk) -> bool:
    return left.start_line <= right.end_line and right.start_line <= left.end_line


def _blocked_split(
    chunks: list[CodeChunk], validation_ratio: float, seed: int
) -> tuple[list[CodeChunk], list[CodeChunk]]:
    """Create deterministic validation blocks without train/validation line overlap."""
    if validation_ratio <= 0 or not chunks:
        return chunks, []
    if len(chunks) == 1:
        chunk = chunks[0]
        lines = chunk.content.splitlines()
        if len(lines) < 2:
            return chunks, []

        # A document shorter than chunk_lines would otherwise have no validation
        # data at all. Split its only chunk at a line boundary, keeping the two
        # sides strictly independent. Prefer enough validation lines to support a
        # continuation record, without consuming the entire training side.
        validation_lines = min(
            len(lines) - 1,
            max(8, round(len(lines) * validation_ratio)),
        )
        validation_at_start = bool(
            hashlib.sha256(
                f"{seed}:{chunk.project}:{chunk.path}:single-chunk".encode()
            ).digest()[0]
            & 1
        )
        boundary = validation_lines if validation_at_start else len(lines) - validation_lines
        first = CodeChunk(
            project=chunk.project,
            path=chunk.path,
            start_line=chunk.start_line,
            end_line=chunk.start_line + boundary - 1,
            content="\n".join(lines[:boundary]),
            source_sha256=chunk.source_sha256,
        )
        second = CodeChunk(
            project=chunk.project,
            path=chunk.path,
            start_line=chunk.start_line + boundary,
            end_line=chunk.start_line + len(lines) - 1,
            content="\n".join(lines[boundary:]),
            source_sha256=chunk.source_sha256,
        )
        if validation_at_start:
            return [second], [first]
        return [first], [second]

    target = max(1, round(len(chunks) * validation_ratio))
    ordered = sorted(
        chunks,
        key=lambda chunk: hashlib.sha256(
            f"{seed}:{chunk.project}:{chunk.path}:{chunk.start_line}".encode()
        ).digest(),
    )
    selected: list[CodeChunk] = []
    for candidate in ordered:
        proposed = [*selected, candidate]
        remaining = [
            chunk
            for chunk in chunks
            if chunk not in proposed
            and not any(_overlaps(chunk, validation) for validation in proposed)
        ]
        if remaining:
            selected.append(candidate)
        if len(selected) >= target:
            break
    train = [
        chunk
        for chunk in chunks
        if chunk not in selected
        and not any(_overlaps(chunk, validation) for validation in selected)
    ]
    return (train, selected) if train else (chunks, [])


def _evidence_blocked_split(
    chunks: list[CodeChunk],
    validation_ratio: float,
    seed: int,
    source_policy: dict[str, Any],
) -> tuple[list[CodeChunk], list[CodeChunk]]:
    """Cover evidenced subjects in validation while retaining independent train evidence."""
    if validation_ratio <= 0 or len(chunks) < 2:
        return _blocked_split(chunks, validation_ratio, seed)

    subjects_by_chunk = {
        id(chunk): set(_subjects_for_chunk(chunk, source_policy)) for chunk in chunks
    }
    available_subjects = set().union(*subjects_by_chunk.values())
    target = max(1, round(len(chunks) * validation_ratio))
    ordered = sorted(
        chunks,
        key=lambda chunk: hashlib.sha256(
            f"{seed}:{chunk.project}:{chunk.path}:{chunk.start_line}".encode()
        ).digest(),
    )
    selected: list[CodeChunk] = []

    def remaining_after(proposed: list[CodeChunk]) -> list[CodeChunk]:
        return [
            chunk
            for chunk in chunks
            if chunk not in proposed
            and not any(_overlaps(chunk, validation) for validation in proposed)
        ]

    def preserves_train_coverage(candidate: CodeChunk) -> bool:
        remaining = remaining_after([*selected, candidate])
        remaining_subjects = set().union(
            *(subjects_by_chunk[id(chunk)] for chunk in remaining)
        )
        return bool(remaining) and remaining_subjects == available_subjects

    validation_subjects: set[str] = set()
    for subject in sorted(available_subjects):
        if subject in validation_subjects:
            continue
        candidate = next(
            (
                chunk
                for chunk in ordered
                if chunk not in selected
                and subject in subjects_by_chunk[id(chunk)]
                and preserves_train_coverage(chunk)
            ),
            None,
        )
        if candidate is not None:
            selected.append(candidate)
            validation_subjects.update(subjects_by_chunk[id(candidate)])

    for candidate in ordered:
        if len(selected) >= target:
            break
        if candidate not in selected and preserves_train_coverage(candidate):
            selected.append(candidate)

    train = remaining_after(selected)
    return (train, selected) if train else (chunks, [])


def _deterministic_trim(
    records: list[dict[str, Any]], key: str, limit: int, seed: int
) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        groups[str(record["metadata"].get(key, "unclassified"))].append(record)
    selected: list[dict[str, Any]] = []
    for group, items in sorted(groups.items()):
        ordered = sorted(
            items,
            key=lambda item: hashlib.sha256(
                (
                    f"{seed}:{group}:{item['metadata'].get('source_key')}:"
                    f"{item['metadata'].get('start_line')}:{item['metadata'].get('task')}"
                ).encode()
            ).digest(),
        )
        selected.extend(ordered[:limit])
    return selected


def _deterministic_subject_trim_preserving_sources(
    records: list[dict[str, Any]], limit: int, seed: int
) -> list[dict[str, Any]]:
    """Limit primary-subject groups without removing an entire retained source."""
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        groups[str(record["metadata"].get("primary_subject", "unclassified"))].append(
            record
        )

    selected: list[dict[str, Any]] = []
    for subject, items in sorted(groups.items()):
        ordered = sorted(
            items,
            key=lambda item: hashlib.sha256(
                (
                    f"{seed}:{subject}:{item['metadata'].get('source_key')}:"
                    f"{item['metadata'].get('start_line')}:{item['metadata'].get('task')}"
                ).encode()
            ).digest(),
        )
        first_by_source: dict[str, dict[str, Any]] = {}
        for item in ordered:
            source_key = str(item["metadata"].get("source_key", "unclassified"))
            first_by_source.setdefault(source_key, item)
        protected = list(first_by_source.values())
        target = max(limit, len(protected))
        protected_ids = {id(item) for item in protected}
        remaining = [item for item in ordered if id(item) not in protected_ids]
        selected.extend(protected)
        selected.extend(remaining[: max(0, target - len(protected))])
    return selected


def _balance_training_records(
    records: list[dict[str, Any]],
    *,
    max_source_fraction: float,
    max_subject_imbalance: float,
    seed: int,
) -> list[dict[str, Any]]:
    if not records:
        return records
    source_counts = Counter(record["metadata"]["source_key"] for record in records)
    if len(source_counts) > 1 and 0 < max_source_fraction < 1:
        other_count = sum(source_counts.values()) - max(source_counts.values())
        source_limit = max(
            1, math.floor(max_source_fraction * other_count / (1 - max_source_fraction))
        )
        records = _deterministic_trim(records, "source_key", source_limit, seed)

    subject_counts = Counter(record["metadata"]["primary_subject"] for record in records)
    if len(subject_counts) > 1 and max_subject_imbalance >= 1:
        subject_limit = max(
            1, math.ceil(min(subject_counts.values()) * max_subject_imbalance)
        )
        records = _deterministic_subject_trim_preserving_sources(
            records,
            subject_limit,
            seed,
        )
    return records


def _subject_counts(records: list[dict[str, Any]]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for record in records:
        counts.update(set(record.get("metadata", {}).get("subjects", [])))
    return dict(sorted(counts.items()))


def _validation_paths(
    sources: list[Any],
    ratio: float,
    seed: int,
    record_counts: dict[str, int],
) -> set[str]:
    """Select whole validation files close to the requested record ratio."""
    if ratio <= 0 or len(sources) < 2:
        return set()
    project = sources[0].project
    target = sum(record_counts.values()) * ratio
    ordered = sorted(
        sources,
        key=lambda source: (
            record_counts[source.relative_path],
            hashlib.sha256(
                f"{seed}:{project}:{source.relative_path}".encode()
            ).digest(),
        ),
    )
    selected: set[str] = set()
    selected_count = 0
    for source in ordered:
        count = record_counts[source.relative_path]
        if abs((selected_count + count) - target) < abs(selected_count - target):
            selected.add(source.relative_path)
            selected_count += count
    if not selected:
        selected.add(ordered[0].relative_path)
    if len(selected) == len(sources):
        selected.remove(ordered[-1].relative_path)
    return selected


def prepare_documents(
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
    document_type: str = "",
    policy: dict[str, Any] | None = None,
    max_source_fraction: float = 1.0,
    max_subject_imbalance: float = 1000.0,
    coverage_failure_mode: str = "error",
) -> dict[str, Any]:
    """Create fine-tuning data from document directories or individual files."""
    if not projects:
        raise ValueError("At least one document directory or file is required")
    if not 0 <= validation_ratio < 1:
        raise ValueError("validation_ratio must be in [0, 1)")
    if policy is not None:
        policy = _validate_policy(policy)

    train_records: list[dict[str, Any]] = []
    validation_records: list[dict[str, Any]] = []
    manifest_projects: list[dict[str, Any]] = []
    policy_sources = _policy_source_map(policy)
    seen_hashes: dict[str, str] = {}
    duplicate_files: list[dict[str, str]] = []
    observed_policy_paths: set[str] = set()
    unmapped_files: list[str] = []
    excluded_training_chunks: list[dict[str, Any]] = []
    unassigned_evidence_chunks: list[dict[str, Any]] = []

    for project_path in projects:
        sources, skipped = scan_project(project_path, max_file_bytes=max_file_bytes)
        if not sources:
            reasons = ", ".join(
                f"{item.relative_path}: {item.reason}" for item in skipped
            )
            detail = f" ({reasons})" if reasons else ""
            raise ValueError(
                f"No eligible document files found in {Path(project_path).resolve()}{detail}"
            )
        project = sources[0].project
        project_document_type = document_type or project.replace("_", " ")
        paths = [source.relative_path for source in sources]
        project_train = 0
        project_validation = 0
        policy_by_hash: dict[str, dict[str, Any]] = {}
        for source in sources:
            source_policy = policy_sources.get(source.relative_path)
            if not source_policy:
                continue
            combined = policy_by_hash.setdefault(
                source.sha256,
                {
                    "subjects": set(),
                    "subject_evidence": defaultdict(list),
                    "evidence_bound": False,
                },
            )
            combined["subjects"].update(source_policy["subjects"])
            combined["evidence_bound"] = (
                combined["evidence_bound"] or source_policy["evidence_bound"]
            )
            for subject, markers in source_policy["subject_evidence"].items():
                combined["subject_evidence"][subject].extend(markers)
        records_by_path: dict[str, list[dict[str, Any]]] = {}
        validation_by_path: dict[str, list[dict[str, Any]]] = {}
        for source in sources:
            source_key = f"{project}/{source.relative_path}"
            observed_policy_paths.add(source.relative_path)
            if policy and not policy_sources.get(source.relative_path):
                unmapped_files.append(source_key)
                records_by_path[source.relative_path] = []
                validation_by_path[source.relative_path] = []
                continue
            if source.sha256 in seen_hashes:
                duplicate_files.append(
                    {"path": source_key, "duplicateOf": seen_hashes[source.sha256]}
                )
                records_by_path[source.relative_path] = []
                validation_by_path[source.relative_path] = []
                continue
            seen_hashes[source.sha256] = source_key
            source_policy = policy_by_hash.get(
                source.sha256,
                {
                    "subjects": set(),
                    "subject_evidence": {},
                    "evidence_bound": False,
                },
            )
            source_policy["subjects"] = sorted(source_policy["subjects"])
            chunks: list[CodeChunk] = []
            for chunk in chunk_document_source(source, chunk_lines, overlap_lines):
                excluded_heading = _excluded_training_section(chunk)
                if excluded_heading:
                    excluded_training_chunks.append(
                        {
                            "path": source_key,
                            "start_line": chunk.start_line,
                            "end_line": chunk.end_line,
                            "reason": f"excluded section: {excluded_heading}",
                        }
                    )
                    continue
                if (
                    policy
                    and source_policy["evidence_bound"]
                    and not _subjects_for_chunk(chunk, source_policy)
                ):
                    unassigned_evidence_chunks.append(
                        {
                            "path": source_key,
                            "start_line": chunk.start_line,
                            "end_line": chunk.end_line,
                            "split": "excluded-before-split",
                        }
                    )
                    continue
                chunks.append(chunk)

            def records_for(
                selected_chunks: list[CodeChunk],
                split_name: str,
                chunk_policy: dict[str, Any] = source_policy,
                current_source_key: str = source_key,
                current_document_type: str = project_document_type,
            ) -> list[dict[str, Any]]:
                result: list[dict[str, Any]] = []
                for chunk in selected_chunks:
                    subjects = _subjects_for_chunk(chunk, chunk_policy)
                    if policy and chunk_policy["evidence_bound"] and not subjects:
                        unassigned_evidence_chunks.append(
                            {
                                "path": current_source_key,
                                "start_line": chunk.start_line,
                                "end_line": chunk.end_line,
                                "split": split_name,
                            }
                        )
                        continue
                    result.extend(
                        _records_for_chunk(chunk, current_document_type, subjects)
                    )
                return result

            if policy:
                if source_policy["evidence_bound"]:
                    train_chunks, validation_chunks = _evidence_blocked_split(
                        chunks, validation_ratio, seed, source_policy
                    )
                else:
                    train_chunks, validation_chunks = _blocked_split(
                        chunks, validation_ratio, seed
                    )
                source_records = records_for(train_chunks, "train")
                validation_by_path[source.relative_path] = records_for(
                    validation_chunks, "validation"
                )
            else:
                source_records = records_for(chunks, "train")
                validation_by_path[source.relative_path] = []
            records_by_path[source.relative_path] = source_records

        validation_paths = (
            set()
            if policy
            else _validation_paths(
                sources,
                validation_ratio,
                seed,
                {path: len(records) for path, records in records_by_path.items()},
            )
        )
        for source in sources:
            records = records_by_path[source.relative_path]
            if policy:
                held_out = validation_by_path[source.relative_path]
                train_records.extend(records)
                validation_records.extend(held_out)
                project_train += len(records)
                project_validation += len(held_out)
            elif source.relative_path in validation_paths:
                validation_records.extend(records)
                project_validation += len(records)
            else:
                train_records.extend(records)
                project_train += len(records)

        # A single selected document cannot be split at file level. Reserve one
        # generated record for validation so document-by-document MCP runs still
        # produce both required datasets.
        if (
            not policy
            and validation_ratio > 0
            and project_validation == 0
            and project_train > 1
        ):
            validation_records.append(train_records.pop())
            project_train -= 1
            project_validation += 1

        if not policy:
            train_records.append(
                _document_tree_record(project, paths, project_document_type)
            )
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

    if policy:
        train_records = _balance_training_records(
            train_records,
            max_source_fraction=max_source_fraction,
            max_subject_imbalance=max_subject_imbalance,
            seed=seed,
        )
        for project in manifest_projects:
            prefix = f"{project['name']}/"
            project["train_records"] = sum(
                1
                for record in train_records
                if str(record["metadata"].get("source_key", "")).startswith(prefix)
            )
            project["validation_records"] = sum(
                1
                for record in validation_records
                if str(record["metadata"].get("source_key", "")).startswith(prefix)
            )

    required_subjects = (
        sorted(set(policy.get("requiredSubjects", []))) if policy else []
    )
    train_subjects = _subject_counts(train_records)
    validation_subjects = _subject_counts(validation_records)
    train_source_counts = Counter(
        record["metadata"].get("source_key", "unclassified")
        for record in train_records
    )
    train_primary_subject_counts = Counter(
        record["metadata"].get("primary_subject", "unclassified")
        for record in train_records
    )
    actual_max_source_fraction = (
        max(train_source_counts.values()) / len(train_records) if train_records else 0.0
    )
    actual_subject_imbalance = (
        max(train_primary_subject_counts.values())
        / min(train_primary_subject_counts.values())
        if len(train_primary_subject_counts) > 1
        else 1.0
    )
    source_balance_pass = (
        len(train_source_counts) <= 1
        or max_source_fraction >= 1
        or actual_max_source_fraction <= max_source_fraction + 1e-12
    )
    subject_balance_pass = (
        len(train_primary_subject_counts) <= 1
        or actual_subject_imbalance <= max_subject_imbalance + 1e-12
    )
    missing_train = [
        item for item in required_subjects if train_subjects.get(item, 0) < 1
    ]
    missing_validation = [
        item for item in required_subjects if validation_subjects.get(item, 0) < 1
    ]
    unused_policy_sources = sorted(set(policy_sources) - observed_policy_paths)
    coverage_pass = (
        not missing_train
        and not missing_validation
        and not unmapped_files
        and not unused_policy_sources
        and source_balance_pass
        and subject_balance_pass
    )
    if coverage_failure_mode not in {"error", "warn"}:
        raise ValueError("coverage_failure_mode must be 'error' or 'warn'")

    rng = random.Random(seed)
    rng.shuffle(train_records)
    rng.shuffle(validation_records)
    _write_jsonl(train_path, train_records)
    _write_jsonl(validation_path, validation_records)
    manifest = {
        "format": 2 if policy else 1,
        "projects": manifest_projects,
        "train_records": len(train_records),
        "validation_records": len(validation_records),
        "dataset_policy": {
            "enabled": policy is not None,
            "status": "pass" if coverage_pass else coverage_failure_mode,
            "required_subjects": required_subjects,
            "train_subject_counts": train_subjects,
            "validation_subject_counts": validation_subjects,
            "missing_train_subjects": missing_train,
            "missing_validation_subjects": missing_validation,
            "content_hash_deduplication": True,
            "duplicate_files": duplicate_files,
            "unmapped_files": sorted(unmapped_files),
            "unused_policy_sources": unused_policy_sources,
            "excluded_training_chunks": excluded_training_chunks,
            "unassigned_evidence_chunks": unassigned_evidence_chunks,
            "non_overlapping_validation": policy is not None,
            "max_source_fraction": max_source_fraction,
            "max_subject_imbalance": max_subject_imbalance,
            "train_source_counts": dict(sorted(train_source_counts.items())),
            "train_primary_subject_counts": dict(
                sorted(train_primary_subject_counts.items())
            ),
            "actual_max_source_fraction": actual_max_source_fraction,
            "actual_subject_imbalance": actual_subject_imbalance,
            "source_balance_pass": source_balance_pass,
            "subject_balance_pass": subject_balance_pass,
        },
        "settings": {
            "chunk_lines": chunk_lines,
            "overlap_lines": overlap_lines,
            "max_file_bytes": max_file_bytes,
            "validation_ratio": validation_ratio,
            "seed": seed,
            "document_type": document_type,
        },
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create safe fine-tuning data from document directories or files"
    )
    parser.add_argument(
        "--config",
        required=True,
        help="Project TOML containing data preparation inputs and outputs",
    )
    parser.add_argument(
        "--project",
        "--input",
        dest="project",
        action="append",
        required=True,
        help="Document directory or individual file; repeatable",
    )
    parser.add_argument("--train-file")
    parser.add_argument("--validation-file")
    parser.add_argument("--manifest-file")
    parser.add_argument(
        "--doc-type",
        help="Description used in system prompts (defaults to project name)",
    )
    parser.add_argument(
        "--policy-file",
        help="JSON source-to-subject plan supplied by the orchestration layer",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = load_config(args.config)
    train_path = resolve_path(args.train_file or nested(config, "data", "train_file"))
    validation_path = resolve_path(
        args.validation_file or nested(config, "data", "validation_file")
    )
    manifest_path = resolve_path(args.manifest_file or nested(config, "data", "manifest_file"))
    policy = _load_policy(args.policy_file)
    clean_output_dir = bool(nested(config, "data", "clean_output_dir", True))
    configured_output_dir = nested(config, "data", "output_dir", None)
    if clean_output_dir and configured_output_dir:
        output_dir = resolve_path(configured_output_dir)
        for generated_path in (train_path, validation_path, manifest_path):
            try:
                generated_path.relative_to(output_dir)
            except ValueError as error:
                raise ValueError(
                    f"Configured dataset output is outside data.output_dir: {generated_path}"
                ) from error
        reset_generated_directory(
            output_dir,
            protected_paths=args.project,
        )
    manifest = prepare_documents(
        args.project,
        train_path,
        validation_path,
        manifest_path,
        chunk_lines=int(nested(config, "data", "chunk_lines", 200)),
        overlap_lines=int(nested(config, "data", "overlap_lines", 40)),
        max_file_bytes=int(nested(config, "data", "max_file_bytes", 1_000_000)),
        validation_ratio=float(nested(config, "data", "validation_ratio", 0.1)),
        seed=int(nested(config, "data", "seed", 42)),
        document_type=args.doc_type or nested(config, "data", "document_type", ""),
        policy=policy,
        max_source_fraction=float(
            nested(config, "dataset_policy", "max_source_fraction", 1.0)
        ),
        max_subject_imbalance=float(
            nested(config, "dataset_policy", "max_subject_imbalance", 1000.0)
        ),
        coverage_failure_mode=str(
            nested(config, "dataset_policy", "coverage_failure_mode", "error")
        ),
    )
    print(
        f"Wrote {manifest['train_records']} training and "
        f"{manifest['validation_records']} validation document records."
    )
    included_files = sum(
        int(project.get("included_files", 0)) for project in manifest["projects"]
    )
    marker = {
        "manifestPath": str(
            args.manifest_file or nested(config, "data", "manifest_file")
        ),
        "trainRecords": int(manifest["train_records"]),
        "validationRecords": int(manifest["validation_records"]),
        "includedFiles": included_files,
        "policyPass": manifest["dataset_policy"]["status"] == "pass",
        "policyStatus": manifest["dataset_policy"]["status"],
        "missingTrainSubjects": manifest["dataset_policy"]["missing_train_subjects"],
        "missingValidationSubjects": manifest["dataset_policy"]["missing_validation_subjects"],
        "duplicateFiles": manifest["dataset_policy"]["duplicate_files"],
        "unmappedFiles": manifest["dataset_policy"]["unmapped_files"],
        "unusedPolicySources": manifest["dataset_policy"]["unused_policy_sources"],
        "datasetPolicy": manifest["dataset_policy"],
    }
    print("FINETUNE_RESULT_JSON=" + json.dumps(marker, ensure_ascii=False))


if __name__ == "__main__":
    main()
