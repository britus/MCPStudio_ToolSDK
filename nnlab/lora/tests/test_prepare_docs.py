from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from finetune_lora.prepare import CodeChunk
from finetune_lora.prepare_docs import (
    _balance_training_records,
    _document_continuation_record,
    _excluded_training_section,
    _subjects_for_chunk,
    _validate_policy,
    chunk_document_source,
    prepare_documents,
)
from finetune_lora.prepare_docs import main as prepare_documents_main
from finetune_lora.scanner import SourceFile


def test_markdown_chunks_never_split_tables_or_fenced_blocks(tmp_path: Path) -> None:
    text = """# Register reference
Intro line one.
Intro line two.

| Register | Bit | Meaning |
|---|---|---|
| CTRL | 0 | Enable |
| CTRL | 1 | Reset |
| STATUS | 0 | Ready |
| STATUS | 1 | Fault |

## Example
```c
write_register(CTRL, ENABLE);
read_register(STATUS);
check_ready();
```

Closing paragraph one.
Closing paragraph two.
Closing paragraph three.
"""
    path = tmp_path / "manual.md"
    source = SourceFile(
        project="docs",
        root=tmp_path,
        path=path,
        relative_path="manual.md",
        text=text,
        sha256="fixture",
    )

    chunks = list(chunk_document_source(source, chunk_lines=8, overlap_lines=2))

    assert len(chunks) >= 2
    table_chunks = [chunk.content for chunk in chunks if "| CTRL |" in chunk.content]
    assert table_chunks
    assert all("| STATUS | 1 | Fault |" in content for content in table_chunks)
    fence_chunks = [
        chunk.content for chunk in chunks if "write_register" in chunk.content
    ]
    assert fence_chunks
    assert all("check_ready();\n```" in content for content in fence_chunks)
    for chunk in chunks:
        continuation = _document_continuation_record(chunk, "test documentation")
        if continuation is None:
            continue
        prompt = continuation["prompt"][1]["content"]
        completion = continuation["completion"][0]["content"]
        if "| CTRL |" in prompt:
            assert "| STATUS | 1 | Fault |" in prompt
        if "| CTRL |" in completion:
            assert "| STATUS | 1 | Fault |" in completion
        if "write_register" in prompt:
            assert "check_ready();\n```" in prompt
        if "write_register" in completion:
            assert "check_ready();\n```" in completion


def test_cli_cleans_configured_dataset_output_before_rebuild(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    docs = tmp_path / "runtime-sources"
    docs.mkdir()
    (docs / "manual.txt").write_text(
        "".join(f"documented line {index}\n" for index in range(30)),
        encoding="utf-8",
    )
    output = tmp_path / "data" / "processed" / "training"
    output.mkdir(parents=True)
    (output / "stale-record.jsonl").write_text("stale", encoding="utf-8")
    config = tmp_path / "config.toml"
    config.write_text(
        """
[data]
output_dir = "data/processed/training"
clean_output_dir = true
train_file = "data/processed/training/train.jsonl"
validation_file = "data/processed/training/validation.jsonl"
manifest_file = "data/processed/training/manifest.json"
chunk_lines = 10
overlap_lines = 0
max_file_bytes = 1000000
validation_ratio = 0.1
seed = 42
""".strip(),
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare-docs",
            "--config",
            str(config),
            "--project",
            str(docs),
        ],
    )

    prepare_documents_main()

    assert not (output / "stale-record.jsonl").exists()
    assert (output / "train.jsonl").is_file()
    assert (output / "validation.jsonl").is_file()
    assert (output / "manifest.json").is_file()


def test_prepare_uses_document_type_in_prompts(tmp_path: Path) -> None:
    doc_dir = tmp_path / "docs"
    doc_dir.mkdir()
    (doc_dir / "manual.txt").write_text(
        "Line one\nLine two\nLine three\nLine four\nLine five\n"
        "Line six\nLine seven\nLine eight\nLine nine\nLine ten\n",
        encoding="utf-8",
    )

    train_path = tmp_path / "train.jsonl"
    val_path = tmp_path / "val.jsonl"
    manifest_path = tmp_path / "manifest.json"

    manifest = prepare_documents(
        [doc_dir],
        train_path,
        val_path,
        manifest_path,
        chunk_lines=4,
        overlap_lines=1,
        max_file_bytes=1_000_000,
        validation_ratio=0.0,
        seed=42,
        document_type="user-provided test docs",
    )

    assert manifest["train_records"] > 0
    records = [json.loads(line) for line in train_path.read_text(encoding="utf-8").splitlines()]
    system_texts = {
        message["content"]
        for record in records
        for message in record["prompt"]
        if message.get("role") == "system"
    }
    assert any("user-provided test docs" in text for text in system_texts)
    assert manifest["settings"]["document_type"] == "user-provided test docs"


def test_prepare_balances_validation_by_generated_record_count(tmp_path: Path) -> None:
    doc_dir = tmp_path / "docs"
    doc_dir.mkdir()
    for name, line_count in (("short-a.txt", 20), ("short-b.txt", 30), ("large.txt", 500)):
        (doc_dir / name).write_text(
            "".join(f"{name} line {index}\n" for index in range(line_count)),
            encoding="utf-8",
        )

    manifest = prepare_documents(
        [doc_dir],
        tmp_path / "train.jsonl",
        tmp_path / "val.jsonl",
        tmp_path / "manifest.json",
        chunk_lines=10,
        overlap_lines=0,
        max_file_bytes=1_000_000,
        validation_ratio=0.1,
        seed=42,
    )

    train_records = manifest["train_records"]
    validation_records = manifest["validation_records"]
    assert 0 < validation_records < train_records
    assert validation_records / (train_records + validation_records) < 0.25


def test_prepare_defaults_to_project_name(tmp_path: Path) -> None:
    doc_dir = tmp_path / "my_project_docs"
    doc_dir.mkdir()
    (doc_dir / "manual.txt").write_text(
        "Line one\nLine two\nLine three\nLine four\nLine five\n"
        "Line six\nLine seven\nLine eight\nLine nine\nLine ten\n",
        encoding="utf-8",
    )

    train_path = tmp_path / "train.jsonl"
    val_path = tmp_path / "val.jsonl"
    manifest_path = tmp_path / "manifest.json"

    prepare_documents(
        [doc_dir],
        train_path,
        val_path,
        manifest_path,
        chunk_lines=4,
        overlap_lines=1,
        max_file_bytes=1_000_000,
        validation_ratio=0.0,
        seed=42,
    )

    records = [json.loads(line) for line in train_path.read_text(encoding="utf-8").splitlines()]
    system_texts = {
        message["content"]
        for record in records
        for message in record["prompt"]
        if message.get("role") == "system"
    }
    assert any("my project docs" in text for text in system_texts)


def test_policy_builds_balanced_non_overlapping_subject_splits(tmp_path: Path) -> None:
    doc_dir = tmp_path / "runtime-sources"
    doc_dir.mkdir()
    for name in ("source-a.txt", "source-b.txt"):
        (doc_dir / name).write_text(
            "".join(f"{name} line {index}\n" for index in range(80)),
            encoding="utf-8",
        )

    train_path = tmp_path / "train.jsonl"
    validation_path = tmp_path / "validation.jsonl"
    manifest = prepare_documents(
        [doc_dir],
        train_path,
        validation_path,
        tmp_path / "manifest.json",
        chunk_lines=12,
        overlap_lines=2,
        max_file_bytes=1_000_000,
        validation_ratio=0.2,
        seed=17,
        policy={
            "requiredSubjects": ["subject-a", "subject-b"],
            "sources": [
                {"path": "source-a.txt", "subjects": ["subject-a"]},
                {"path": "source-b.txt", "subjects": ["subject-b"]},
            ],
        },
        max_source_fraction=0.6,
        max_subject_imbalance=1.5,
    )

    assert manifest["format"] == 2
    assert manifest["dataset_policy"]["status"] == "pass"
    assert manifest["dataset_policy"]["missing_train_subjects"] == []
    assert manifest["dataset_policy"]["missing_validation_subjects"] == []

    train = [json.loads(line) for line in train_path.read_text().splitlines()]
    validation = [
        json.loads(line) for line in validation_path.read_text().splitlines()
    ]
    for train_record in train:
        for validation_record in validation:
            train_meta = train_record["metadata"]
            validation_meta = validation_record["metadata"]
            if train_meta["source_key"] != validation_meta["source_key"]:
                continue
            assert (
                train_meta["end_line"] < validation_meta["start_line"]
                or validation_meta["end_line"] < train_meta["start_line"]
            )


def test_policy_v2_requires_subject_specific_evidence() -> None:
    with pytest.raises(ValueError, match="subjectEvidence keys must match subjects"):
        _validate_policy(
            {
                "format": 2,
                "requiredSubjects": ["direction", "latch"],
                "sources": [
                    {
                        "path": "manual.md",
                        "subjects": ["direction", "latch"],
                        "subjectEvidence": {"direction": ["IODIR"]},
                    }
                ],
            }
        )


def test_policy_v2_assigns_only_subjects_evidenced_in_chunk() -> None:
    chunk = CodeChunk(
        project="docs",
        path="manual.md",
        start_line=1,
        end_line=3,
        content="The IODIR register controls pin direction. GPIO reads the port.",
        source_sha256="fixture",
    )
    source_policy = {
        "subjects": ["direction", "output-latch"],
        "evidence_bound": True,
        "subject_evidence": {
            "direction": ["IODIR register controls pin direction"],
            "output-latch": ["OLAT register provides access to the output latches"],
        },
    }

    assert _subjects_for_chunk(chunk, source_policy) == ["direction"]


def test_related_parts_chunk_is_excluded_from_training() -> None:
    chunk = CodeChunk(
        project="docs",
        path="adc.md",
        start_line=900,
        end_line=950,
        content="## Related Parts\n\n| Part | Interface |\n| LTC2308 | SPI |",
        source_sha256="fixture",
    )

    assert _excluded_training_section(chunk) == "related parts"


def test_policy_v2_builds_splits_from_evidenced_chunks_only(tmp_path: Path) -> None:
    doc_dir = tmp_path / "runtime-sources"
    doc_dir.mkdir()
    chunks = [
        ["IODIR controls pin direction", "d1", "d2", "d3"],
        ["IODIR controls pin direction", "d4", "d5", "d6"],
        ["OLAT provides access to output latches", "l1", "l2", "l3"],
        ["OLAT provides access to output latches", "l4", "l5", "l6"],
        ["Unrelated SPI product catalogue", "x1", "x2", "x3"],
    ]
    (doc_dir / "manual.txt").write_text(
        "\n".join(line for chunk in chunks for line in chunk) + "\n",
        encoding="utf-8",
    )
    train_path = tmp_path / "train.jsonl"
    validation_path = tmp_path / "validation.jsonl"

    manifest = prepare_documents(
        [doc_dir],
        train_path,
        validation_path,
        tmp_path / "manifest.json",
        chunk_lines=4,
        overlap_lines=0,
        max_file_bytes=1_000_000,
        validation_ratio=0.25,
        seed=31,
        policy={
            "format": 2,
            "requiredSubjects": ["direction", "output-latch"],
            "sources": [
                {
                    "path": "manual.txt",
                    "subjects": ["direction", "output-latch"],
                    "subjectEvidence": {
                        "direction": ["IODIR controls pin direction"],
                        "output-latch": [
                            "OLAT provides access to output latches"
                        ],
                    },
                }
            ],
        },
    )

    assert manifest["dataset_policy"]["status"] == "pass"
    assert manifest["dataset_policy"]["unassigned_evidence_chunks"]
    records = [
        json.loads(line)
        for path in (train_path, validation_path)
        for line in path.read_text(encoding="utf-8").splitlines()
    ]
    assert {record["metadata"]["primary_subject"] for record in records} == {
        "direction",
        "output-latch",
    }
    assert all(
        "Unrelated SPI product catalogue" not in record["completion"][0]["content"]
        for record in records
    )


def test_policy_splits_short_document_into_independent_records(tmp_path: Path) -> None:
    doc_dir = tmp_path / "runtime-sources"
    doc_dir.mkdir()
    (doc_dir / "short.txt").write_text(
        "".join(f"short line {index}\n" for index in range(54)),
        encoding="utf-8",
    )

    train_path = tmp_path / "train.jsonl"
    validation_path = tmp_path / "validation.jsonl"
    manifest = prepare_documents(
        [doc_dir],
        train_path,
        validation_path,
        tmp_path / "manifest.json",
        chunk_lines=140,
        overlap_lines=20,
        max_file_bytes=1_000_000,
        validation_ratio=0.1,
        seed=42,
        policy={
            "requiredSubjects": ["short-subject"],
            "sources": [{"path": "short.txt", "subjects": ["short-subject"]}],
        },
    )

    assert manifest["dataset_policy"]["status"] == "pass"
    assert manifest["dataset_policy"]["missing_train_subjects"] == []
    assert manifest["dataset_policy"]["missing_validation_subjects"] == []
    train = [json.loads(line) for line in train_path.read_text().splitlines()]
    validation = [json.loads(line) for line in validation_path.read_text().splitlines()]
    assert train
    assert validation
    assert all(
        train_record["metadata"]["end_line"]
        < validation_record["metadata"]["start_line"]
        or validation_record["metadata"]["end_line"]
        < train_record["metadata"]["start_line"]
        for train_record in train
        for validation_record in validation
    )


def test_policy_deduplicates_equal_content_by_hash(tmp_path: Path) -> None:
    doc_dir = tmp_path / "runtime-sources"
    doc_dir.mkdir()
    content = "".join(f"shared line {index}\n" for index in range(80))
    (doc_dir / "source-a.txt").write_text(content, encoding="utf-8")
    (doc_dir / "source-b.txt").write_text(content, encoding="utf-8")

    manifest = prepare_documents(
        [doc_dir],
        tmp_path / "train.jsonl",
        tmp_path / "validation.jsonl",
        tmp_path / "manifest.json",
        chunk_lines=12,
        overlap_lines=2,
        max_file_bytes=1_000_000,
        validation_ratio=0.2,
        seed=19,
        policy={
            "requiredSubjects": ["subject-a", "subject-b"],
            "sources": [
                {"path": "source-a.txt", "subjects": ["subject-a"]},
                {"path": "source-b.txt", "subjects": ["subject-b"]},
            ],
        },
    )

    report = manifest["dataset_policy"]
    assert report["status"] == "pass"
    assert len(report["duplicate_files"]) == 1
    assert set(report["train_subject_counts"]) == {"subject-a", "subject-b"}


def test_policy_rejects_missing_required_subject_before_preparation(
    tmp_path: Path,
) -> None:
    doc_dir = tmp_path / "runtime-sources"
    doc_dir.mkdir()
    (doc_dir / "source-a.txt").write_text("Authoritative source text.\n")

    with pytest.raises(
        ValueError,
        match="does not cover requiredSubjects: subject-b",
    ):
        prepare_documents(
            [doc_dir],
            tmp_path / "train.jsonl",
            tmp_path / "validation.jsonl",
            tmp_path / "manifest.json",
            chunk_lines=12,
            overlap_lines=2,
            max_file_bytes=1_000_000,
            validation_ratio=0.2,
            seed=23,
            policy={
                "requiredSubjects": ["subject-a", "subject-b"],
                "sources": [
                    {"path": "source-a.txt", "subjects": ["subject-a"]},
                ],
            },
        )

    assert not (tmp_path / "train.jsonl").exists()
    assert not (tmp_path / "validation.jsonl").exists()


def test_subject_balancing_preserves_each_retained_source() -> None:
    records = []
    for source, subject, count in (
        ("source-a", "subject-a", 4),
        ("source-b", "subject-a", 4),
        ("source-c", "subject-b", 2),
    ):
        for index in range(count):
            records.append(
                {
                    "metadata": {
                        "source_key": source,
                        "primary_subject": subject,
                        "subjects": [subject],
                        "start_line": index * 10 + 1,
                        "task": "document-reproduction",
                    }
                }
            )

    balanced = _balance_training_records(
        records,
        max_source_fraction=1.0,
        max_subject_imbalance=1.0,
        seed=29,
    )

    assert {record["metadata"]["source_key"] for record in balanced} == {
        "source-a",
        "source-b",
        "source-c",
    }
