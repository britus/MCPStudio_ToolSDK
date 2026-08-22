# Local LoRA Training and Retrieval Framework

This directory contains an offline-first framework for adapting a local language model to
project-specific source code or technical documentation. It combines two complementary methods:

1. **LoRA/QLoRA training** learns recurring terminology, conventions, and structural patterns.
2. **Local retrieval (RAG)** supplies current, query-specific source excerpts from a SQLite index.

A fine-tune is not a database of the current repository state. Use retrieval for exact and
frequently changing implementation details; use training for stable behavior and domain patterns.

## Current v3 lifecycle

The current framework configuration is [`config/mcpstudio-v3.toml`](config/mcpstudio-v3.toml).
The v3 lifecycle deliberately separates training, candidate creation, verification, and deployment:

1. Load and validate one UTF-8 training objective (`.md` or `.txt`).
2. Resolve the exact source documents required by that objective.
3. Materialize the selected documents into an isolated per-run staging directory.
4. Build fresh, content-hash-deduplicated training and validation datasets.
5. Enforce source balance, required-subject coverage, and non-overlapping validation coverage.
6. Run a one-iteration MLX smoke test.
7. Run full training only after the smoke test passes. Validation-based checkpoint selection,
   early stopping, and best-checkpoint restoration are controlled by the TOML configuration.
8. Generate a reusable `data/verifications/run-*/verification_input.json` plus a run-specific
   held-out prompt suite from the training objective and trained adapter.
9. In a separate verification run, atomically bootstrap a completely absent master from the first
   trained adapter, or merge an existing master into a new candidate directory. Verify exactly the
   adapter returned by that preparation step against held-out prompts.
10. Install or update the LM Studio model only after an explicit `PASS` decision.

The EoF MCP Studio workflows implement these gates automatically. The shell scripts and Makefile
expose the same underlying operations for direct use.

### Docling PDF extraction

PDF materialization uses Docling. It preserves headings, reading order, tables, page boundaries,
formulas and references to separately extracted figures instead of flattening every page to plain
text. The resulting Markdown is the only PDF-derived file admitted to the training dataset; image
artifacts remain available beside it for inspection and provenance.

Conversion is staged and published atomically. Existing output is rejected unless
`--replace-output` explicitly requests a clean replacement. A machine-readable result reports the
actual Markdown path, source hash, page and element counts, warnings and runtime to MCP Studio.

## Requirements

- Python 3.11 or 3.12
- A local Transformers/Safetensors or MLX model directory for training
- Apple Silicon and sufficient unified memory for MLX LoRA/QLoRA training, or an NVIDIA/CUDA
  system for Transformers LoRA/QLoRA
- A locally loaded model and local server for LM Studio chat
- A current, built `llama.cpp` checkout for GGUF export

A GGUF file loaded by LM Studio can be used for chat and RAG, but it cannot be trained directly.
Training requires the original local model directory, including its configuration, tokenizer, and
weight files.

The setup downloads the Docling layout, table, formula and OCR models into
`~/.cache/docling/models`. Runtime scripts then set `HF_HUB_OFFLINE`, `TRANSFORMERS_OFFLINE`, and
telemetry opt-outs. Model weights, source material, datasets, prompts, and generated artifacts
remain local. Initial Python dependency and Docling model installation require network access.

## Setup

Run all commands from this directory:

```bash
cd nnlab/lora
```

The default setup is the Apple Silicon MLX environment:

```bash
make setup
# Equivalent: ./scripts/setup.sh --mlx
```

Other installation modes are:

```bash
make setup-rag    # local RAG/chat only
make setup-train  # Transformers/PEFT plus MLX
make setup-cuda   # Transformers/PEFT plus bitsandbytes
```

To select a specific supported Python interpreter:

```bash
FINETUNE_PYTHON=/opt/homebrew/opt/python@3.12/bin/python3.12 make setup
```

The setup script creates `.venv` and installs this package in editable mode. All other wrappers
require that virtual environment.

## Minimal Gemma 4 Patch in the mlx runtime

To complete a training with the Gemma 4 Model, apply this little patch in
nnlab/lora/.venv/lib/python3.12/site-packages/mlx_lm/models/gemma4_text.py
```text
        top_k_indices = mx.argpartition(
            expert_scores, kth=-self.config.top_k_experts, axis=-1
        )
        top_k_indices = top_k_indices[..., -self.config.top_k_experts :]
->PATCH Line 138:
        top_k_indices = mx.stop_gradient(top_k_indices)
```

## Configuration

Every framework command that depends on model, data, training, retrieval, verification, merge, or
deployment settings requires an explicit `--config` argument. For a new experiment, copy the v3
configuration and keep every lifecycle path internally consistent:

```bash
cp config/mcpstudio-v3.toml config/my-project.toml
```

Important sections include:

- `model`: local base-model directory and offline loading policy
- `data`: training, validation, manifest, MLX data, and retrieval-index paths
- `pdf_extraction`: Docling model cache, OCR, formula recognition, image scale and timeout
- `dataset_policy`: source-balance and required-subject coverage gates
- `training`: backend, adapter output, LoRA parameters, and MLX/Transformers settings
- `checkpoint_policy`: validation interval, early stopping, and best-checkpoint behavior
- `verification`: held-out prompts, adapter, and report defaults
- `verification_input`: generated hand-off directory and acceptance criteria
- `merge`: master adapter, new adapters, weights, and non-destructive output
- `deployment`: adapter and LM Studio installation identity

Relative paths are resolved from the `nnlab/lora` project root because every wrapper changes to
that directory before launching Python. `model.local_files_only` must remain `true`.

The v3 configuration cleans `data.output_dir` before rebuilding a dataset and cleans the selected
Smoke or Candidate `training.output_dir` before a new, non-resumed training run. Cleanup is limited
to nested project directories and refuses project roots, top-level directories, symbolic links, and
directories containing a selected input. Resume runs preserve their existing checkpoint directory.

The generic [`config/default.toml`](config/default.toml) is useful for basic source-code experiments,
but it does not define the full v3 verification, merge, and deployment lifecycle.

## Direct shell usage

Shell options are named and repeatable. Configuration files and input paths are not positional
arguments.

### Build a source-code dataset and retrieval index

```bash
CONFIG=config/my-project.toml

./scripts/prepare.sh \
  --config "$CONFIG" \
  --input /absolute/path/project-a \
  --input /absolute/path/Services.swift

./scripts/index.sh \
  --config "$CONFIG" \
  build \
  --project /absolute/path/project-a \
  --project /absolute/path/project-b
```

`prepare.sh` accepts directories and individual source files. `index.sh` uses the `build`
subcommand and repeats `--project` for every indexed input.

For source-code training, prepare, index, and train can also be run as one command:

```bash
./scripts/pipeline.sh \
  --config "$CONFIG" \
  --input /absolute/path/project-a \
  --input /absolute/path/project-b
```

### Build a documentation dataset

Use `prepare_docs.sh` for already readable text documents or directories:

```bash
./scripts/prepare_docs.sh \
  --config "$CONFIG" \
  --input /absolute/path/manual.txt \
  --input /absolute/path/documentation
```

PDF extraction is a separate, layout-aware operation. Its output directory must initially be
absent:

```bash
./scripts/extract_pdfs.sh \
  --config "$CONFIG" \
  --source /absolute/path/manuals \
  --output data/prepared_docs/manuals \
  --manifest data/prepared_docs/manuals-manifest.json

./scripts/prepare_docs.sh \
  --config "$CONFIG" \
  --input data/prepared_docs/manuals
```

The extraction manifest is optional. It records Docling settings and version, source hashes,
Markdown and artifact paths, page and element counts, partial-conversion warnings, and runtimes.
Use `--replace-output` only when intentionally rebuilding an existing manual extraction; the MCP
Studio workflow always creates a fresh per-run directory.

The MCP Studio v3 workflow additionally creates a source-to-subject policy file and passes it with
`--policy-file`. This enables deterministic coverage and balance gates that cannot be inferred from
plain input paths alone. Version 2 policies bind every subject to direct `subjectEvidence`; a chunk
inherits only the subjects whose normalized evidence occurs in that chunk. Catalogue-style
`Related Parts` chunks and chunks without matching subject evidence are excluded and reported in
the dataset manifest. Provide multiple independent excerpts per subject when possible so both the
training and non-overlapping validation split retain evidence.

### Smoke test and full training

```bash
./scripts/smoke_train.sh --config "$CONFIG"

./scripts/train.sh \
  --config "$CONFIG" \
  --objective-file /absolute/path/training-objective.md
```

`--objective-file` is used only for full training. After training succeeds, it creates a reusable
`verification_input.json` containing the objective-derived verification context and exact merge and
verification paths. By default, `verification_input.auto_generate_prompts = true` also creates a
run-specific `eval-prompts.jsonl` from the objective's `Release boundaries`. Set the option to
`false` to require the manually curated `verification.prompts_file` instead. Generated prompts are
useful for workflow tests, but a release decision should eventually use human-reviewed prompts.
When automatic generation is enabled and `verification.prompts_file` is configured, that configured
path is atomically maintained as a relative symlink to the newest run-specific prompt file. A
regular file at that path is never overwritten.
Generated prompts carry the objective's named training scope but have no mechanical keyword score;
their answers require the workflow's semantic evidence review. Merge and report outputs also receive
the run name by default, so repeated verification runs never overwrite an earlier candidate or
report. Set `verification_input.run_scoped_outputs = false` only when shared output paths are
intentional. The objective itself is never placed into the training dataset.

To resume a supported training backend from a checkpoint:

```bash
./scripts/train.sh \
  --config "$CONFIG" \
  --resume-from-checkpoint /absolute/path/checkpoint
```

### Merge and verify

With the v3 defaults, full training writes a candidate adapter. If the configured master is absent,
the first merge command copies that one candidate atomically and at full weight into the master,
records `method: master-bootstrap`, and returns the master for verification. A partial master is
never overwritten. Retrying the same verification input reuses the hash-matching bootstrap instead
of merging the same adapter twice. Once a different trained adapter is supplied, merge writes a
separate merged adapter. The configured operation can be run with:

```bash
./scripts/merge_adapters.sh --config "$CONFIG"
```

Override merge inputs explicitly when reproducing a generated verification hand-off:

```bash
./scripts/merge_adapters.sh \
  --config "$CONFIG" \
  --master artifacts/finetune_lora \
  --adapters artifacts/finetune_lora_candidate \
  --weights 0.5 0.5 \
  --output artifacts/finetune_lora_merged
```

The output must differ from all inputs. Existing non-empty output directories are rejected unless
`--force` is explicitly supplied. `--in-place` is reserved for an intentional, recoverable master
replacement.

Run the configured held-out evaluation:

```bash
./scripts/evaluate_base.sh --config "$CONFIG"
./scripts/evaluate.sh --config "$CONFIG"
```

Paths can be overridden without editing the TOML:

```bash
./scripts/verify_suite.sh \
  --config "$CONFIG" \
  --adapter artifacts/finetune_lora_merged \
  --prompts eval/eval-prompts.jsonl \
  --output artifacts/verification-report.json
```

For inference diagnostics, run the same prompt JSONL while retaining both the raw model output and
the reasoning-stripped answer in a separate JSON report:

```bash
./scripts/inference_test.sh \
  --config "$CONFIG" \
  --adapter artifacts/finetune_lora \
  --prompts data/verifications/run-*/eval-prompts.jsonl \
  --output artifacts/inference-test-report.json
```

Use `--prompt-id ID` to isolate one prompt, `--show-raw` to print reasoning-channel output, and
`--temperature 0` or `--max-tokens N` for deterministic or bounded diagnostic runs. The JSON report
always retains the raw output, rendered prompt, visible output, token count, finish reason and
runtime for every selected prompt.

Process success is not a model-quality decision. Review every generated answer for factual
relevance, required coverage, unsupported claims, cross-context contamination, prompt leakage, and
repeated control tokens. The EoF MCP Studio verification workflow returns only `PASS`, `FAIL`, or
`INCONCLUSIVE` and never deploys automatically. Verification generation uses its own deterministic,
bounded `verification.temperature` and `verification.max_new_tokens` settings. A missing/null prompt
pass rate means unscored semantic checks, not a zero score.

### Chat and local retrieval

Start the local LM Studio server first, then run:

```bash
./scripts/chat.sh --config "$CONFIG" --backend lmstudio

./scripts/chat.sh \
  --config "$CONFIG" \
  --backend lmstudio \
  --prompt "Where is the database connection created?"
```

For direct local adapter inference:

```bash
./scripts/chat.sh \
  --config "$CONFIG" \
  --backend mlx \
  --adapter artifacts/finetune_lora_candidate
```

Use `--no-rag` to disable retrieval for a chat or verification run.

## Makefile interface

The Makefile defaults to `config/mcpstudio-v3.toml`. Override it with `CONFIG=...` on any target:

```bash
make train CONFIG=config/my-project.toml
```

`INPUTS` is a whitespace-separated list. The Makefile converts every item into the repeatable flag
expected by the target:

- `prepare`, `prepare-docs`, and `pipeline`: one `--input` per item
- `index`: one `--project` per item, after the required `build` subcommand

Examples:

```bash
make prepare \
  CONFIG=config/my-project.toml \
  INPUTS='/absolute/path/project-a /absolute/path/Services.swift'

make index \
  CONFIG=config/my-project.toml \
  INPUTS='/absolute/path/project-a /absolute/path/project-b'

make pipeline \
  CONFIG=config/my-project.toml \
  INPUTS='/absolute/path/project-a /absolute/path/project-b'
```

Because Make splits `INPUTS` on whitespace, invoke the shell wrappers directly when an input path
contains spaces.

Target-specific `*_ARGS` variables are appended unchanged after the generated arguments. This is
the supported way to pass optional script parameters through Make:

```bash
make train \
  CONFIG=config/my-project.toml \
  TRAIN_ARGS='--objective-file /absolute/path/training-objective.md'

make chat \
  CONFIG=config/my-project.toml \
  CHAT_ARGS='--backend lmstudio --prompt "Summarize the adapter lifecycle"'

make verify-suite \
  CONFIG=config/my-project.toml \
  VERIFY_ARGS='--adapter artifacts/finetune_lora_merged --prompts eval/eval-prompts.jsonl --output artifacts/verification-report.json'

make inference-test \
  CONFIG=config/my-project.toml \
  INFERENCE_TEST_ARGS='--adapter artifacts/finetune_lora --prompts data/verifications/run-123/eval-prompts.jsonl --prompt-id example-id'

make fuse \
  CONFIG=config/my-project.toml \
  FUSE_ARGS='--adapter artifacts/finetune_lora_merged --dry-run'
```

Available pass-through variables are `PREPARE_ARGS`, `PREPARE_DOCS_ARGS`, `INDEX_ARGS`,
`PIPELINE_ARGS`, `TRAIN_ARGS`, `CHAT_ARGS`, `EVALUATE_ARGS`, `INFERENCE_TEST_ARGS`, `VERIFY_ARGS`, `MERGE_ARGS`,
`FUSE_ARGS`, `DEPLOY_ARGS`, and `EXPORT_ARGS`.

## LM Studio deployment

Fuse and validate the verified MLX adapter before publishing it into LM Studio:

```bash
./scripts/fuse_model.sh \
  --config "$CONFIG" \
  --adapter artifacts/finetune_lora_merged \
  --dry-run

./scripts/fuse_model.sh \
  --config "$CONFIG" \
  --adapter artifacts/finetune_lora_merged
```

The base model defaults to the pristine model recorded in the adapter's `train_setup.json`. A
different pristine base can be supplied with `--base-model`. New model names receive the
`eofnnlab-` prefix automatically.

For the configured deployment wrapper, pass the exact adapter that received the verification
`PASS`. This explicit override also prevents a stale `deployment.adapter` value from selecting an
unverified training artifact:

```bash
./deploy/lm-studio/install.sh \
  --config "$CONFIG" \
  --adapter artifacts/finetune_lora_merged \
  --dry-run
./deploy/lm-studio/install.sh \
  --config "$CONFIG" \
  --adapter artifacts/finetune_lora_merged

# Transactionally replace an existing installation after verification PASS:
./deploy/lm-studio/install.sh \
  --config "$CONFIG" \
  --adapter artifacts/finetune_lora_merged \
  --replace \
  --dry-run
./deploy/lm-studio/install.sh \
  --config "$CONFIG" \
  --adapter artifacts/finetune_lora_merged \
  --replace
```

The replacement path stages and validates the new model, backs up the existing model, hub entry,
and defaults, swaps the installation, and rolls back on failure. See
[`deploy/lm-studio/README.md`](deploy/lm-studio/README.md) for deployment details.

## GGUF export

The GGUF wrapper uses Transformers/PEFT to merge an adapter into its Hugging Face base model. It is
for adapters produced by the Transformers backend, not MLX adapter artifacts. GGUF export requires
all output paths explicitly:

```bash
export LLAMA_CPP=/absolute/path/llama.cpp

./scripts/export_gguf.sh \
  --config "$CONFIG" \
  --adapter artifacts/transformers_lora \
  --merged-dir artifacts/finetune_lora_hf_merged \
  --f16-output models/finetune_lora_f16.gguf \
  --output models/finetune_lora_Q4_K_M.gguf \
  --quantization Q4_K_M
```

The script merges the adapter into the local base model, converts it to F16 GGUF, and then runs the
`llama.cpp` quantizer.

## EoF MCP Studio integration

Importable v3 tools, skills, prompts, workflows, runtime permissions, and the shared ScriptTool
dispatcher live under [`config/mcpstudio/config-v3`](config/mcpstudio/config-v3). Open this
`nnlab/lora` directory as the EoF MCP Studio chat project so `${CHAT_PROJECT_DIR}` resolves to the
correct project root.

The v3 training workflow accepts a selected objective file, discovers or validates exact source
documents, builds a fresh policy-gated dataset, runs smoke and full training, and emits the
verification hand-off. The separate verification workflow loads that hand-off, creates a reversible
merged candidate, verifies the exact returned candidate, and produces the release decision. Neither
workflow deploys a model. Before using an EoF MCP Studio install or update tool, set
`deployment.adapter` to the exact merged adapter returned by the successful verification run.

See [`config/README.md`](config/README.md) for import order, runtime allow-list setup, and workflow
details.

## Data safety

The scanners honor Git ignores in Git repositories and skip common secrets, credentials, private
keys, binary/non-UTF-8 files, build outputs, dependencies, model directories, caches, and files over
`data.max_file_bytes`.

These filters are a safety net, not a guarantee. Before training, inspect the configured manifest
and sample both JSONL files. Never use held-out verification prompts as training data.

## Tests

```bash
make test
# Equivalent: ./scripts/test.sh
```

The test suite runs Ruff and pytest without downloading a model.

## References

- [Google Gemma fine-tuning](https://ai.google.dev/gemma/docs/tune)
- [PyTorch on macOS](https://docs.pytorch.org/get-started/locally/)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
