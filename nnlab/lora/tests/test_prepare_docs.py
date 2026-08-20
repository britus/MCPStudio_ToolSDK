from __future__ import annotations

import json
from pathlib import Path

import pytest

from finetune_lora.prepare_docs import _balance_training_records, prepare_documents


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
    validation = [json.loads(line) for line in validation_path.read_text().splitlines()]
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
    validation = [
        json.loads(line) for line in validation_path.read_text().splitlines()
    ]
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
