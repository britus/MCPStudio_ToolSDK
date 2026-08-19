# LM Studio Deployment: Fine-tuned Model

This directory contains the offline deployment setup for the locally trained
V2 master adapter, including the project, Huawei and Quectel LoRAs. It
registers a fused copy of the model inside an existing LM Studio installation
without contacting any model hub.

## Files

- `config.toml` — deployment identifiers and paths
- `install.sh` — offline installer script

## Requirements

- The project virtual environment (`.venv`) must be set up with MLX support:
  ```bash
  FINETUNE_PYTHON=/opt/homebrew/opt/python@3.12/bin/python3.12 \
    ./scripts/setup.sh --mlx
  ```
- The pristine base model must exist locally:
  ```text
  models/google/gemma-4-26b-a4b/
  ```
- The trained adapter must exist locally:
  ```text
  artifacts/finetune_lora/
  ```
- LM Studio must have been launched at least once so its data directory exists
  (default: `~/.lmstudio`).

## Install

```bash
./deploy/lm-studio/install.sh
```

The script reads the base model, merged adapter and LM Studio identifiers from
`deploy/lm-studio/config.toml`.

### Update an existing installation

The update path builds and validates the new fused model first, then replaces
the existing model and hub entry transactionally. Existing per-model defaults
are preserved and merged with the managed prompt/reasoning fields.

```bash
./deploy/lm-studio/install.sh --replace
```

### Dry run

Validate paths and identifiers without writing anything:

```bash
./deploy/lm-studio/install.sh --dry-run
```

### Custom LM Studio data directory

```bash
LMSTUDIO_ROOT=/path/to/lmstudio ./deploy/lm-studio/install.sh
```

Or pass a custom deployment config:

```bash
./deploy/lm-studio/install.sh /path/to/my-deploy-config.toml
```

## Result

After installation, the model appears in LM Studio as:

- **Concrete model:** `~/.lmstudio/models/eofnnlab/eofnnlab-finetune_lora/`
- **Hub entry:** `~/.lmstudio/hub/models/eofnnlab/finetune_lora/`
- **Model defaults:**
  `~/.lmstudio/.internal/user-concrete-model-default-config/eofnnlab/eofnnlab-finetune_lora.json`
- **LM Studio model ID:** `eofnnlab/finetune_lora`
- **Concrete model key:** `eofnnlab/eofnnlab-finetune_lora`

Reload LM Studio's model list (or restart the app) before loading the model.

## Offline guarantee

The installer sets `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1` through
`scripts/common.sh`. No model weights, metadata, or telemetry leave the local
machine.
