#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

HAS_CONFIG=false
HAS_INPUT=false
for ARG in "$@"; do
  [[ "${ARG}" == "--config" ]] && HAS_CONFIG=true
  [[ "${ARG}" == "--input" ]] && HAS_INPUT=true
done

if [[ "${HAS_CONFIG}" != true || "${HAS_INPUT}" != true ]]; then
  echo "Usage: scripts/prepare_docs.sh --config CONFIG --input PATH [--input PATH ...] [--policy-file JSON]" >&2
  exit 2
fi

exec "${PYTHON}" -m finetune_lora.prepare_docs "$@"
