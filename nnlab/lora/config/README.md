# EoF MCP Studio configuration for model training and deployment

This directory contains importable EoF MCP Studio configurations for the local
MLX LoRA project. The configurations use fixed project entry points rather
than accepting arbitrary shell commands.

## Contents

- `Tools/`: dedicated tools for training, verification, adapter merge, first LM
  Studio installation and transactional update of an existing installation.
- `Skills/`: restricted interactive skills plus hidden, tool-free workflow
  context skills for LLM planning, review and reporting agents.
- `Prompts/`: reusable operator prompts with configurable project, adapter and
  training paths.
- `MultiAgents/`: training and verification pipelines with separate coordinator,
  tool-runner, reviewer and synthesizer roles.
- `Scripts/finetune_tools.js`: shared ScriptTool dispatcher used by the six
  tool definitions.
- `Runtime/oscommands.finetune.example.json`: minimal allow-list fragment for
  the project's executable scripts.

## Import order

Import or create the configurations in this order so all references can be
resolved when a workflow is opened:

1. `Tools/*.json`
2. `Skills/*.json`
3. `Prompts/*.json`
4. `MultiAgents/*.json`

`Import from Directory` imports Skills before MultiAgents, so the workflow skill
references resolve during the same directory import. Existing records with the
same configuration name can be overwritten if selected or delete the existing
`finetune_adapter_training_workflow` and `finetune_master_verification_workflow` in
EoF MCP Studio before re-importing this directory when applying an updated workflow.

The six tool names are:

- `finetune_prepare_documents`
- `finetune_train_adapter`
- `finetune_verify_master`
- `finetune_merge_adapters`
- `finetune_lmstudio_install`
- `finetune_lmstudio_update`

The ScriptTool files use `${CHAT_PROJECT_DIR}`. Open the repository directory
`${TOOLSDK}/nnlab/lora` as the EoF MCP Studio chat project before running
them. The workflow ToolRunner properties default to that chat project and can be
edited in the workflow inspector. The `${CHAT_PROJECT_DIR}` macro is automatically 
set by EoF MCP Studio when you open a directory in the File Explorer view. This macro 
is listed in the app setting in `Substitution`.

## Local execution permission

These tools execute local scripts and therefore need the EoF MCP Studio Professional
runtime or the supported Launch Agent configuration. Add a security bookmark for
the project directory. Merge the entries from
`Runtime/oscommands.finetune.example.json` into the existing user file:

`~/Library/Application Support/MCPStudio/oscommands.json`

Do not replace an existing allow-list wholesale. Preserve existing commands and
activation decisions, add the two executable roots and add only missing command
entries. Exact matching is intentionally used for every command.

## Training workflow

`finetune_adapter_training_workflow` defaults to the non-destructive
`${CHAT_PROJECT_DIR}/config/mcpstudio-v3.toml`, which writes to
`artifacts/finetune_lora_candidate`. Before a run, set both ToolRunner
`configPath` properties and the coordinator `trainingConfig` to the same
absolute TOML. Relative training-tool inputs remain supported and are normalized
to an absolute path before execution. The workflow:

1. audits the requested configuration and objective without executing tools;
2. resolves exact local source files from explicit paths or `rag_query` and
   blocks when any requested subject is missing;
3. runs `finetune_prepare_documents`, which extracts each selected PDF (or copies a
   readable text document) into an isolated per-run batch and invokes
   `scripts/prepare_docs.sh` once for that batch;
4. checks the generated manifest, source alignment and non-zero training and
   validation record counts;
5. runs a one-iteration smoke test only after the dataset gate passes;
6. independently gates and runs the full training;
7. reports the sources, manifest, process results and output for later
   verification.

It intentionally does not merge or install an adapter.

Its LLM coordinator, auditor, dataset reviewer, smoke reviewer and synthesizer use the hidden
`finetune_adapter_training_workflow_context` skill. That skill has `toolScopeMode`
`none`. `Training Document Finder` uses the separate hidden
`finetune_training_document_discovery` skill restricted to `rag_query`. Only the
configured Prepare, Smoke and Full MCP Tool agents execute project scripts.

The prepare tool requires both `extract_pdfs.sh` and `prepare_docs.sh` in the
Script Runtime allow-list. The example runtime file includes both exact command
entries. It accepts one or more absolute paths or `file://` URIs. Every run gets
its own `data/prepared_docs/run-*` staging directory, so an earlier extracted
batch cannot silently enter a later dataset. The configured
`data/processed/manifest.json` remains the authoritative gate artifact.

## Verification workflow

`finetune_master_verification_workflow` defaults to `artifacts/finetune_lora`
and mode `all`. It verifies the required automatically generated prompts and runs
the held-out evaluations. The final decision is restricted to `PASS`, `FAIL` or
`INCONCLUSIVE`. It intentionally does not deploy the adapter.

Its LLM coordinator, readiness inspector, evidence reviewer and synthesizer use
the hidden `finetune_master_verification_workflow_context` skill. That skill has
`toolScopeMode` `none`; only `Master Verification Runner` may execute the
verification tool.

The reports produced in mode `all` are:

- `artifacts/verification_master_prompts.json`
- `artifacts/evaluation-master-propmpts.json`

## Merge and LM Studio deployment

`finetune_merge_adapters` creates `artifacts/finetune_lora_candidate` by default.
It uses the configured master plus the adapters with normalized weights. When the
master is already a provenance-backed merge, the command preserves its leading
general-project component and refreshes the trailing domain components. If `master`
points to a newly trained general adapter instead, it performs a fresh exact merge.
Use a candidate path for normal work. `inPlace=true` is
reserved for an explicit, recoverable replacement operation.

After the verification workflow returns `PASS`:

- use `finetune_lmstudio_install` only when the configured LM Studio target does not exist;
- use `finetune_lmstudio_update` for the existing local target. The update path stages
  and validates the new model, temporarily backs up the old model/hub/defaults,
  swaps the installation atomically and rolls back on failure;
- run either tool with `dryRun=true` first.

Deployment settings remain in `deploy/lm-studio/config.toml`. The current target is
the local LM Studio model `eofnnlab/finetune_lora`.

## Safety and release rule

A successful training or merge process is not proof of model quality. The expected
release order is:

`training -> candidate merge -> verification PASS -> dry-run update -> update`

Do not bind the install or update tools into the training or verification workflows;
deployment remains an explicit operator action.
