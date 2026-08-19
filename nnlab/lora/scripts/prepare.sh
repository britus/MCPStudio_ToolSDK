#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

HAS_CONFIG=false
HAS_INPUT=false
for ARG in "$@"; do
  [[ "${ARG}" == "--config" ]] && HAS_CONFIG=true
  [[ "${ARG}" == "--input" || "${ARG}" == "--project" ]] && HAS_INPUT=true
done
if [[ "${HAS_CONFIG}" != true || "${HAS_INPUT}" != true ]]; then
  echo "Usage: scripts/prepare.sh --config CONFIG --input PATH [--input PATH ...]" >&2
  exit 2
fi

exec "${PYTHON}" -m finetune_lora.prepare "$@"
