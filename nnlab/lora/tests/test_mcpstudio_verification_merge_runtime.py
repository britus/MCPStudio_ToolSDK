from __future__ import annotations

import json
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_ROOT = PROJECT_ROOT / "config" / "mcpstudio" / "config-v3"
WORKFLOW_PATH = (
    CONFIG_ROOT / "MultiAgents" / "finetune_master_verification_workflow.json"
)


def _workflow() -> dict[str, Any]:
    return json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))


def _agent(workflow: dict[str, Any], name: str) -> dict[str, Any]:
    return next(item for item in workflow["agents"] if item["name"] == name)


def _property_arguments(agent: dict[str, Any]) -> dict[str, Any]:
    arguments: dict[str, Any] = {}
    for item in agent["properties"]:
        value: Any = item["value"]
        if item["valueType"] == "json" and isinstance(value, str):
            value = json.loads(value)
        elif item["valueType"] == "boolean" and isinstance(value, str):
            value = value.lower() == "true"
        arguments[item["key"]] = value
    return arguments


def _pass_override(arguments: dict[str, Any], payload: dict[str, Any], keys: str) -> None:
    for key in keys.split(","):
        arguments[key] = payload[key]


def _connection(
    workflow: dict[str, Any], source: str, target: str
) -> dict[str, Any]:
    return next(
        item
        for item in workflow["connections"]
        if item["source"] == source and item["target"] == target
    )


def test_verification_merge_pipeline_order_and_provider_scope() -> None:
    workflow = _workflow()
    names = {agent["name"] for agent in workflow["agents"]}
    assert names == {
        "Verification Request Router",
        "Load Verification Input",
        "Verification Merge Readiness Inspector",
        "Candidate Merge Runner",
        "Merged Candidate Verification Runner",
        "Merged Candidate Evidence Reviewer",
        "Verification Merge Gate Synthesizer",
    }

    llm_agents = [
        agent for agent in workflow["agents"] if agent["executionMode"] == "llmInstruction"
    ]
    assert all(agent["llmProviderID"] == "activeSession" for agent in llm_agents)
    assert all(agent["skillNames"] for agent in llm_agents)
    loader = _agent(workflow, "Load Verification Input")
    assert loader["toolName"] == "finetune_load_verification_input"
    router = _agent(workflow, "Verification Request Router")
    assert router["role"] != "rootCoordinator"
    assert router["role"] == "planner"

    edges = [(item["source"], item["target"]) for item in workflow["connections"]]
    remaining = set(names)
    resolved: set[str] = set()
    while remaining:
        ready = {
            name
            for name in remaining
            if all(source in resolved for source, target in edges if target == name)
        }
        assert ready, "workflow graph contains a cycle"
        resolved.update(ready)
        remaining.difference_update(ready)

    assert _connection(
        workflow, "Load Verification Input", "Verification Merge Readiness Inspector"
    )["condition"] == "$.success equals true"
    assert _connection(
        workflow, "Verification Merge Readiness Inspector", "Candidate Merge Runner"
    )["condition"] == "$.ready equals true"
    assert _connection(
        workflow, "Candidate Merge Runner", "Merged Candidate Verification Runner"
    )["condition"] == "$.success equals true"


def test_runtime_simulation_loads_one_file_and_routes_exact_merge_output() -> None:
    workflow = _workflow()
    selected_file = str(
        PROJECT_ROOT / "data/verifications/run-test/verification_input.json"
    )
    router_payload = {
        "verificationConfig": selected_file,
        "projectRoot": str(PROJECT_ROOT),
    }
    loader_arguments = _property_arguments(_agent(workflow, "Load Verification Input"))
    router_to_loader = _connection(
        workflow, "Verification Request Router", "Load Verification Input"
    )
    assert router_to_loader["artifactPolicy"] == "pass-override"
    _pass_override(
        loader_arguments, router_payload, router_to_loader["sharedStateKeys"]
    )
    assert loader_arguments == router_payload

    loader_result = {
        "success": True,
        "verificationConfig": selected_file,
        "projectRoot": str(PROJECT_ROOT),
        "configPath": "config/mcpstudio-v3.toml",
        "promptsFile": "eval/eval-prompts.jsonl",
        "outputFile": "artifacts/runtime-verification.json",
        "subjectContext": "runtime subject context",
        "acceptanceCriteria": "review every held-out case",
        "master": "artifacts/finetune_lora",
        "adapters": ["artifacts/finetune_lora_candidate"],
        "weights": ["0.5", "0.5"],
        "output": "artifacts/runtime-merged",
        "force": False,
    }
    merge_arguments = _property_arguments(_agent(workflow, "Candidate Merge Runner"))
    loader_to_merge = _connection(
        workflow, "Load Verification Input", "Candidate Merge Runner"
    )
    assert loader_to_merge["artifactPolicy"] == "pass-override"
    _pass_override(
        merge_arguments, loader_result, loader_to_merge["sharedStateKeys"]
    )
    assert merge_arguments == {
        "configPath": "config/mcpstudio-v3.toml",
        "adapters": ["artifacts/finetune_lora_candidate"],
        "force": False,
        "inPlace": False,
        "master": "artifacts/finetune_lora",
        "output": "artifacts/runtime-merged",
        "projectRoot": str(PROJECT_ROOT),
        "weights": ["0.5", "0.5"],
    }

    merge_result = {
        "success": True,
        "adapter": "artifacts/runtime-merged",
        "mergeReportPath": "artifacts/runtime-merged/merge_report.json",
    }
    verification_arguments = _property_arguments(
        _agent(workflow, "Merged Candidate Verification Runner")
    )
    loader_to_verification = _connection(
        workflow, "Load Verification Input", "Merged Candidate Verification Runner"
    )
    merge_to_verification = _connection(
        workflow, "Candidate Merge Runner", "Merged Candidate Verification Runner"
    )
    _pass_override(
        verification_arguments,
        loader_result,
        loader_to_verification["sharedStateKeys"],
    )
    _pass_override(
        verification_arguments,
        merge_result,
        merge_to_verification["sharedStateKeys"],
    )
    assert verification_arguments["adapter"] == loader_result["output"]
    assert verification_arguments["promptsFile"] == loader_result["promptsFile"]
    assert verification_arguments["outputFile"] == loader_result["outputFile"]


def test_tool_bridge_loads_validated_input_and_emits_merge_handoff() -> None:
    script = (CONFIG_ROOT / "Scripts" / "finetune_tools.js").read_text(
        encoding="utf-8"
    )
    merge_module = (PROJECT_ROOT / "src/finetune_lora/merge_adapters.py").read_text(
        encoding="utf-8"
    )
    assert "function loadVerificationInput" in script
    assert "payload.schemaVersion !== 1" in script
    assert "projectRoot does not match the active chat project" in script
    assert "normalizedDirectoryIdentity(payloadRoot.value)" in script
    assert "const bootstrapRequired = !masterWeightsPresent" in script
    assert "master is incomplete" in script
    assert "finetuneLoadVerificationInput: loadVerificationInput" in script
    assert "FINETUNE_RESULT_JSON=" in merge_module
    assert '"method": "master-bootstrap"' in merge_module
    assert "report = prepare_verification_candidate(" in merge_module
    assert "matching_bootstrap = _matching_bootstrap" in merge_module
    assert "adapterPresent" in script
    assert "reportPresent" in script


def test_loader_tool_satisfies_swift_schema_property_decoder() -> None:
    tool = json.loads(
        (
            CONFIG_ROOT
            / "Tools"
            / "finetune_load_verification_input.json"
        ).read_text(encoding="utf-8")
    )
    for schema_name in ("inputSchema", "outputSchema"):
        for key, prop in tool[schema_name]["properties"].items():
            assert isinstance(prop.get("type"), str), key
            assert isinstance(prop.get("description"), str), key
            assert prop["description"].strip(), key
    assert tool["outputSchema"]["properties"]["bootstrapRequired"]["type"] == "boolean"


def test_workflow_explicitly_supports_first_master_bootstrap() -> None:
    workflow = _workflow()
    readiness = _agent(workflow, "Verification Merge Readiness Inspector")
    candidate_runner = _agent(workflow, "Candidate Merge Runner")

    assert "bootstrapRequired=true" in readiness["instruction"]
    assert "exactly one trained adapter" in readiness["instruction"]
    assert "atomically bootstrap" in candidate_runner["instruction"]
    assert "without scaling" in candidate_runner["instruction"]
    assert "completely absent master" in workflow["systemInstruction"]


def test_evidence_review_applies_runtime_variant_tolerance_before_contamination() -> None:
    workflow = _workflow()
    reviewer = _agent(workflow, "Merged Candidate Evidence Reviewer")
    context = json.loads(
        (
            CONFIG_ROOT
            / "Skills"
            / "finetune_master_verification_workflow_context.json"
        ).read_text(encoding="utf-8")
    )["systemInstruction"]

    assert "documented variants" in reviewer["instruction"]
    assert "Mixed terminology alone is not a failure" in reviewer["instruction"]
    assert "invented identifiers" in reviewer["instruction"]
    assert "subjectContext permits it" in context
    assert "Runtime tolerance never excuses invented" in context


def test_verification_prompt_has_only_one_file_parameter() -> None:
    prompt = json.loads(
        (CONFIG_ROOT / "Prompts" / "finetune_master_verification.json").read_text(
            encoding="utf-8"
        )
    )
    assert prompt["arguments"] == [
        {
            "description": (
                "Select the absolute data/verifications/.../verification_input.json "
                "generated by a successful training run."
            ),
            "name": "verification_config",
            "required": True,
        }
    ]
    template = prompt["template"]
    assert "run_workflow.user_prompt" in template
    assert "Verification config (absolute): {{verification_config}}" in template
    assert "merge_master" not in template
    assert "acceptance_criteria" not in template
