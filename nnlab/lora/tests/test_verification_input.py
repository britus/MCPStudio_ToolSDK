from __future__ import annotations

import json
from pathlib import Path

from finetune_lora.verification_input import create_verification_input


def test_creates_self_contained_verification_input_from_training_run(
    tmp_path: Path,
) -> None:
    adapter = tmp_path / "artifacts" / "candidate"
    adapter.mkdir(parents=True)
    (adapter / "adapters.safetensors").write_bytes(b"weights")
    (adapter / "adapter_config.json").write_text("{}\n", encoding="utf-8")
    objective = tmp_path / "training-objective.txt"
    objective.write_text("Runtime subject and source constraints.\n", encoding="utf-8")
    config = tmp_path / "config.toml"
    config.write_text(
        """
[verification]
prompts_file = "eval/held-out.jsonl"
output_file = "artifacts/verification.json"

[merge]
master = "artifacts/master"
weights = ["0.25", "0.75"]
output = "artifacts/merged"

[verification_input]
output_root = "data/verifications"
acceptance_criteria = "Review all runtime cases independently."
""".strip()
        + "\n",
        encoding="utf-8",
    )

    output = create_verification_input(
        config,
        adapter,
        objective,
        project_root=tmp_path,
        run_name="run-test",
    )
    payload = json.loads(output.read_text(encoding="utf-8"))

    assert output == tmp_path / "data/verifications/run-test/verification_input.json"
    assert payload["schemaVersion"] == 1
    assert payload["projectRoot"] == str(tmp_path)
    assert payload["configPath"] == "config.toml"
    assert payload["subjectContext"] == "Runtime subject and source constraints."
    assert payload["acceptanceCriteria"] == "Review all runtime cases independently."
    assert payload["master"] == "artifacts/master"
    assert payload["adapters"] == ["artifacts/candidate"]
    assert payload["weights"] == ["0.25", "0.75"]
    assert payload["output"] == "artifacts/merged"
    assert payload["force"] is False


def test_uses_equal_weights_when_configured_count_does_not_match(
    tmp_path: Path,
) -> None:
    adapter = tmp_path / "candidate"
    adapter.mkdir()
    (adapter / "adapters.safetensors").write_bytes(b"weights")
    (adapter / "adapter_config.json").write_text("{}", encoding="utf-8")
    objective = tmp_path / "objective.md"
    objective.write_text("Runtime context", encoding="utf-8")
    config = tmp_path / "config.toml"
    config.write_text(
        """
[verification]
prompts_file = "prompts.jsonl"
output_file = "verification.json"
[merge]
master = "master"
weights = []
output = "merged"
""".strip(),
        encoding="utf-8",
    )

    output = create_verification_input(
        config,
        adapter,
        objective,
        project_root=tmp_path,
        run_name="run-equal",
    )
    assert json.loads(output.read_text(encoding="utf-8"))["weights"] == ["1", "1"]
