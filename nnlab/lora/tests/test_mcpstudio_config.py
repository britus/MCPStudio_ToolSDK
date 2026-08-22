from __future__ import annotations

import json
import tomllib
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RELEASE_CONFIG_ROOT = PROJECT_ROOT / "config" / "mcpstudio" / "config-v3"
TRAINING_WORKFLOW = (
    RELEASE_CONFIG_ROOT / "MultiAgents" / "finetune_adapter_training_workflow.json"
)


def _training_workflow() -> dict:
    return json.loads(TRAINING_WORKFLOW.read_text(encoding="utf-8"))


def test_release_metadata_is_explicit_and_not_part_of_object_names() -> None:
    with (PROJECT_ROOT / "config" / "mcpstudio-v3.toml").open("rb") as handle:
        metadata = tomllib.load(handle)["metadata"]

    assert metadata == {"name": "finetune", "method": "lora", "release": 3}
    assert all("_v3" not in path.name for path in RELEASE_CONFIG_ROOT.rglob("*.json"))


def test_v3_training_outputs_are_cleaned_before_fresh_runs() -> None:
    with (PROJECT_ROOT / "config" / "mcpstudio-v3.toml").open("rb") as handle:
        config = tomllib.load(handle)

    assert config["data"]["output_dir"] == "data/processed/finetune_lora"
    assert config["data"]["clean_output_dir"] is True
    assert config["training"]["clean_output_dir"] is True


def test_v3_pdf_extraction_uses_cpu_for_docling_python_compatibility() -> None:
    with (PROJECT_ROOT / "config" / "mcpstudio-v3.toml").open("rb") as handle:
        config = tomllib.load(handle)

    assert config["pdf_extraction"] == {
        "engine": "docling",
        "artifacts_path": "~/.cache/docling/models",
        "device": "cpu",
        "ocr": True,
        "formula_enrichment": True,
        "image_scale": 2.0,
        "document_timeout": 600,
    }


def test_v3_verification_generation_is_deterministic_and_bounded() -> None:
    with (PROJECT_ROOT / "config" / "mcpstudio-v3.toml").open("rb") as handle:
        config = tomllib.load(handle)

    assert config["verification"]["temperature"] == 0.0
    assert config["verification"]["max_new_tokens"] == 4096


def test_training_request_router_is_an_executed_llm_agent() -> None:
    workflow = _training_workflow()
    router = next(
        agent for agent in workflow["agents"] if agent["name"] == "Training Coordinator"
    )

    assert router["executionMode"] == "llmInstruction"
    assert router["role"] != "rootCoordinator"
    assert router["llmProviderID"] == "activeSession"
    assert router["skillNames"] == ["finetune_training_request_router"]


def test_llm_agents_use_skill_scoped_headless_execution() -> None:
    workflow = _training_workflow()
    llm_agents = [
        agent for agent in workflow["agents"] if agent["executionMode"] == "llmInstruction"
    ]

    assert llm_agents
    assert all(agent["llmProviderID"] == "activeSession" for agent in llm_agents)
    assert all(agent["skillNames"] for agent in llm_agents)


def test_objective_router_passes_named_values_to_loader() -> None:
    workflow = _training_workflow()
    connection = next(
        item
        for item in workflow["connections"]
        if item["source"] == "Training Coordinator"
        and item["target"] == "Load Training Objective"
    )

    assert connection["artifactPolicy"] == "pass-structured"
    assert set(connection["sharedStateKeys"].split(",")) == {
        "objectiveFile",
        "objectiveText",
        "projectRoot",
    }


def test_runtime_source_plan_uses_an_injectable_json_placeholder() -> None:
    workflow = _training_workflow()
    preparer = next(
        agent
        for agent in workflow["agents"]
        if agent["name"] == "Prepare Training Documents"
    )
    source_plan = next(
        prop for prop in preparer["properties"] if prop["key"] == "sourcePlan"
    )

    assert source_plan["required"] is True
    assert source_plan["valueType"] == "json"
    assert source_plan["value"] == "{}"


def test_full_training_receives_objective_for_verification_input_generation() -> None:
    workflow = _training_workflow()
    full_runner = next(
        agent for agent in workflow["agents"] if agent["name"] == "Full Training Runner"
    )
    objective = next(
        prop for prop in full_runner["properties"] if prop["key"] == "objectiveFile"
    )
    connection = next(
        item
        for item in workflow["connections"]
        if item["source"] == "Load Training Objective"
        and item["target"] == "Full Training Runner"
    )

    assert objective["required"] is True
    assert objective["value"] == ""
    assert connection["artifactPolicy"] == "pass-override"
    assert connection["sharedStateKeys"] == "objectiveFile"


def test_reporting_agent_has_a_tool_free_skill() -> None:
    workflow = _training_workflow()
    reporter = next(
        agent
        for agent in workflow["agents"]
        if agent["name"] == "Training Result Synthesizer"
    )
    skill_path = (
        RELEASE_CONFIG_ROOT
        / "Skills"
        / f"{reporter['skillNames'][0]}.json"
    )
    skill = json.loads(skill_path.read_text(encoding="utf-8"))

    assert skill["toolScopeMode"] == "none"
    assert skill["allowedToolNames"] == []


def test_training_prompts_require_complete_workflow_input_forwarding() -> None:
    prompt_paths = [RELEASE_CONFIG_ROOT / "Prompts" / "finetune_training_cycle.json"]

    for prompt_path in prompt_paths:
        prompt = json.loads(prompt_path.read_text(encoding="utf-8"))
        template = prompt["template"]
        assert "copy every line" in template.lower()
        assert "run_workflow.user_prompt" in template
        assert "<workflow_input>" in template
        assert "</workflow_input>" in template
        assert "Training objective file: {{training_objective_file}}" in template
        assert not template.startswith("Use the workflow")

    assert not (
        RELEASE_CONFIG_ROOT / "Prompts" / "finetune_configurable_training_cycle.json"
    ).exists()


def test_training_workflow_uses_absolute_config_paths() -> None:
    workflow = _training_workflow()
    expected = "${CHAT_PROJECT_DIR}/config/mcpstudio-v3.toml"
    config_values = []
    for agent in workflow["agents"]:
        for prop in agent.get("properties", []):
            if prop["key"] in {"configPath", "trainingConfig"}:
                config_values.append(prop["value"])

    assert config_values
    assert set(config_values) == {expected}

    fixed_prompt = json.loads(
        (
            RELEASE_CONFIG_ROOT / "Prompts" / "finetune_training_cycle.json"
        ).read_text(encoding="utf-8")
    )
    assert all(
        argument["name"] != "training_config"
        for argument in fixed_prompt["arguments"]
    )
    assert f"Training configuration (absolute): `{expected}`" in fixed_prompt["template"]

    script = (
        RELEASE_CONFIG_ROOT / "Scripts" / "finetune_tools.js"
    ).read_text(encoding="utf-8")
    assert "function projectConfigPath" in script
    assert "shared.joinPath(root, relativePath(normalized" in script
    assert "const configPath = projectConfigPath(" in script


def test_document_finder_reserves_enough_tool_rounds_for_final_json() -> None:
    workflow = _training_workflow()
    finder = next(
        agent
        for agent in workflow["agents"]
        if agent["name"] == "Training Document Finder"
    )

    assert finder["maxTurns"] == 24
    assert "Batch independent rag_query calls" in finder["instruction"]
    assert "reserve the final turn" in finder["instruction"]


def test_source_discovery_requires_consistent_complete_coverage() -> None:
    skill_path = (
        RELEASE_CONFIG_ROOT / "Skills" / "finetune_training_document_discovery.json"
    )
    skill = json.loads(skill_path.read_text(encoding="utf-8"))
    instruction = skill["systemInstruction"]

    assert "requiredSubjects minus coveredSubjects" in instruction
    assert "Never return approved=true" in instruction
    assert "still-uncovered required subject" in instruction
    assert "matching filename alone is insufficient" in instruction
    assert "`top_k` is an integer, never a Boolean" in instruction
    assert "collection names must never be guessed" in instruction
    assert "missing or rejected optional source is a warning" in instruction.lower()
    assert "warnings array is compatible with approval" in instruction
    assert "Rejected sources must never appear" in instruction
    assert "never emit an evidence array" in instruction
    assert "`subjectEvidence`" in instruction
    assert "Related Parts section" in instruction
    assert "Never place a conditional subject in requiredSubjects" in instruction
    assert "missingSubjects" in instruction
    assert "must never contain conditional subjects" in instruction
    assert "unresolvedConditionalSubjects" in instruction
    assert "compatible with approval" in instruction
    assert "RAG snippets cannot prove" in instruction
    assert "generated list or heading" in instruction
    assert "absence is then a warning, not a blocker" in instruction
    workflow = _training_workflow()
    finder = next(
        agent
        for agent in workflow["agents"]
        if agent["name"] == "Training Document Finder"
    )
    assert "Never promote a conditional subject to required" in finder["instruction"]
    assert "generated list or heading alone is not such intent" in finder["instruction"]
    assert "generated verification and conditional subjects warn" in next(
        prop["value"]
        for prop in finder["properties"]
        if prop["key"] == "discoveryPolicy"
    )


def test_policy_contract_is_not_written_into_document_input_directory() -> None:
    script_path = RELEASE_CONFIG_ROOT / "Scripts" / "finetune_tools.js"
    script = script_path.read_text(encoding="utf-8")

    assert "runSegment + '-dataset-policy.json'" in script
    assert "shared.joinPath(runPath, 'dataset-policy.json')" not in script
    assert "sourcePlan does not cover requiredSubjects" in script
    assert "function evidenceText" in script
    assert "function subjectEvidence" in script
    assert "must be a non-empty string or array of strings" in script
    assert "return evidenceParts(value, label).join('\\n')" in script
    assert "format: 2" in script
    assert "subjectEvidence: plan ? plan.sources[index].subjectEvidence : {}" in script
    assert "extractionResult.engine === 'docling'" in script
    assert "extractedDocument.materialized_path" in script
    assert "extractedDocument.output_relative_path" in script
    assert "Docling produced no valid Markdown file" in script
    assert (
        "['--source', source, '--output', documentDir, '--config', configPath]"
        in script
    )
    assert "MCPStudio.fileExists(extractedPath)" in script


def test_verification_workflow_preserves_unscored_prompt_rate() -> None:
    workflow = json.loads(
        (
            RELEASE_CONFIG_ROOT
            / "MultiAgents"
            / "finetune_master_verification_workflow.json"
        ).read_text(encoding="utf-8")
    )
    instructions = "\n".join(agent["instruction"] for agent in workflow["agents"])

    assert "missing or null promptPassRate" in instructions
    assert "never convert it to zero" in instructions
