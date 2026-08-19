#!/usr/bin/env bash
# Fuse a configured LoRA adapter into a new local LM Studio model.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
source "${PROJECT_ROOT}/scripts/common.sh"

HAS_CONFIG=false
for ARG in "$@"; do
  [[ "${ARG}" == "--config" ]] && HAS_CONFIG=true
done
if [[ "${HAS_CONFIG}" != true ]]; then
  echo "Usage: deploy/lm-studio/install.sh --config CONFIG [deployment overrides]" >&2
  exit 2
fi

exec "${PYTHON}" -m finetune_lora.lmstudio_fuse "$@"
