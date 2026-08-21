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
    assert payload["promptsFile"] == "data/verifications/run-test/eval-prompts.jsonl"
    assert payload["outputFile"] == "artifacts/verification-run-test.json"
    assert payload["subjectContext"] == "Runtime subject and source constraints."
    assert payload["acceptanceCriteria"] == "Review all runtime cases independently."
    assert payload["master"] == "artifacts/master"
    assert payload["adapters"] == ["artifacts/candidate"]
    assert payload["weights"] == ["0.25", "0.75"]
    assert payload["output"] == "artifacts/merged-run-test"
    assert payload["force"] is False
    assert payload["trainingRun"]["promptSource"] == "generated"
    assert payload["trainingRun"]["promptCount"] == 1
    prompt_lines = (
        tmp_path / "data/verifications/run-test/eval-prompts.jsonl"
    ).read_text(encoding="utf-8").splitlines()
    assert len(prompt_lines) == 1
    generated_prompt = json.loads(prompt_lines[0])
    assert generated_prompt["id"] == "training-objective-the-documented-scope-key-technical-behavior-and-limitations"
    assert generated_prompt["must_contain"] == []
    assert generated_prompt["must_not_contain"] == []
    assert "training objective" in generated_prompt["prompt"][0]["content"]
    assert "training objective" in generated_prompt["prompt"][1]["content"]


def test_generates_prompts_from_release_boundaries(tmp_path: Path) -> None:
    adapter = tmp_path / "candidate"
    adapter.mkdir()
    (adapter / "adapters.safetensors").write_bytes(b"weights")
    (adapter / "adapter_config.json").write_text("{}", encoding="utf-8")
    objective = tmp_path / "training-radio.txt"
    objective.write_text(
        """Training objective: radio documentation
Focus on the Radio-X transceiver.

Release boundaries
Training completion is not a verification PASS.
Verify address selection independently.
Check unsupported-claim behavior during verification.
Require explicit PASS before merge.

Expected discovery result
Return approved=true when sources are available.
""",
        encoding="utf-8",
    )
    config = tmp_path / "config.toml"
    config.write_text(
        """
[verification]
output_file = "verification.json"
[merge]
master = "master"
output = "merged"
""".strip(),
        encoding="utf-8",
    )

    output = create_verification_input(
        config,
        adapter,
        objective,
        project_root=tmp_path,
        run_name="run-focuses",
    )
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert "variant" in payload["acceptanceCriteria"]
    assert "mixed terminology alone is not a failure" in payload[
        "acceptanceCriteria"
    ]
    prompts_path = tmp_path / payload["promptsFile"]
    prompts = [
        json.loads(line)
        for line in prompts_path.read_text(encoding="utf-8").splitlines()
    ]

    assert [item["verification_focus"] for item in prompts] == [
        "address selection",
        "unsupported-claim behavior",
    ]
    assert all(
        "radio documentation" in message["content"]
        for item in prompts
        for message in item["prompt"]
    )
    assert all(
        "Radio-X transceiver" in message["content"]
        for item in prompts
        for message in item["prompt"]
    )
    assert payload["trainingRun"]["promptCount"] == 2


def test_can_keep_configured_shared_output_paths(tmp_path: Path) -> None:
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
output_file = "verification.json"
[merge]
master = "master"
output = "merged"
[verification_input]
run_scoped_outputs = false
""".strip(),
        encoding="utf-8",
    )

    output = create_verification_input(
        config,
        adapter,
        objective,
        project_root=tmp_path,
        run_name="run-shared",
    )
    payload = json.loads(output.read_text(encoding="utf-8"))

    assert payload["output"] == "merged"
    assert payload["outputFile"] == "verification.json"


def test_uses_configured_prompts_when_generation_is_disabled(tmp_path: Path) -> None:
    adapter = tmp_path / "candidate"
    adapter.mkdir()
    (adapter / "adapters.safetensors").write_bytes(b"weights")
    (adapter / "adapter_config.json").write_text("{}", encoding="utf-8")
    objective = tmp_path / "objective.md"
    objective.write_text("Runtime context", encoding="utf-8")
    prompts = tmp_path / "eval/manual.jsonl"
    prompts.parent.mkdir()
    prompts.write_text('{"id":"manual","prompt":[{"role":"user","content":"Test"}]}\n')
    config = tmp_path / "config.toml"
    config.write_text(
        """
[verification]
prompts_file = "eval/manual.jsonl"
output_file = "verification.json"
[merge]
master = "master"
output = "merged"
[verification_input]
auto_generate_prompts = false
""".strip(),
        encoding="utf-8",
    )

    output = create_verification_input(
        config,
        adapter,
        objective,
        project_root=tmp_path,
        run_name="run-manual",
    )
    payload = json.loads(output.read_text(encoding="utf-8"))

    assert payload["promptsFile"] == "eval/manual.jsonl"
    assert payload["trainingRun"]["promptSource"] == "configured"
    assert payload["trainingRun"]["promptCount"] == 1


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


def test_bokara_variant_policy_is_runtime_data_not_release_code() -> None:
    project_root = Path(__file__).resolve().parents[1]
    objective = (project_root / "training-bokara.txt").read_text(encoding="utf-8")
    release_root = project_root / "config/mcpstudio/config-v3"
    release_text = "\n".join(
        path.read_text(encoding="utf-8") for path in release_root.rglob("*.json")
    )
    release_text += (project_root / "src/finetune_lora/verification_input.py").read_text(
        encoding="utf-8"
    )

    assert "MCP23008 (I2C) and MCP23S08 (SPI)" in objective
    assert "documentation-quality warning" in objective
    assert "does not reinterpret the LTC2309 interface" in objective
    assert "MCP23S08" not in release_text
