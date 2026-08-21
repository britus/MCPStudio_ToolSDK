from pathlib import Path

import pytest

from finetune_lora.output_cleanup import reset_generated_directory


def test_recreates_generated_output_without_stale_files(tmp_path: Path) -> None:
    output = tmp_path / "artifacts" / "candidate"
    output.mkdir(parents=True)
    (output / "stale-checkpoint.bin").write_bytes(b"stale")

    result = reset_generated_directory(output, project_root=tmp_path)

    assert result == output
    assert output.is_dir()
    assert list(output.iterdir()) == []


def test_refuses_top_level_project_directory(tmp_path: Path) -> None:
    output = tmp_path / "artifacts"
    output.mkdir()

    with pytest.raises(ValueError, match="top-level project directory"):
        reset_generated_directory(output, project_root=tmp_path)

    assert output.is_dir()


def test_refuses_directory_containing_an_input(tmp_path: Path) -> None:
    output = tmp_path / "data" / "processed"
    source = output / "source.txt"
    source.parent.mkdir(parents=True)
    source.write_text("authoritative input", encoding="utf-8")

    with pytest.raises(ValueError, match="containing an input"):
        reset_generated_directory(
            output,
            project_root=tmp_path,
            protected_paths=[source],
        )

    assert source.read_text(encoding="utf-8") == "authoritative input"
