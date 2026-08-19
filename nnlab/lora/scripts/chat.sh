#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

HAS_CONFIG=false
for ARG in "$@"; do
  [[ "${ARG}" == "--config" ]] && HAS_CONFIG=true
done
if [[ "${HAS_CONFIG}" != true ]]; then
  echo "Usage: scripts/chat.sh --config CONFIG [chat options]" >&2
  exit 2
fi

exec "${PYTHON}" -m finetune_lora.chat "$@"
