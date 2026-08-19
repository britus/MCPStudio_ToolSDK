#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

HAS_CONFIG=false
HAS_ADAPTER=false
HAS_PROMPTS=false
HAS_OUTPUT=false
for ARG in "$@"; do
  [[ "${ARG}" == "--config" ]] && HAS_CONFIG=true
  [[ "${ARG}" == "--adapter" ]] && HAS_ADAPTER=true
  [[ "${ARG}" == "--prompts" ]] && HAS_PROMPTS=true
  [[ "${ARG}" == "--output" ]] && HAS_OUTPUT=true
done
if [[ "${HAS_CONFIG}" != true || "${HAS_ADAPTER}" != true || "${HAS_PROMPTS}" != true || "${HAS_OUTPUT}" != true ]]; then
  echo "Usage: scripts/verify_suite.sh --config CONFIG --adapter PATH --prompts PATH --output PATH [--no-rag]" >&2
  exit 2
fi

exec "${PYTHON}" -m finetune_lora.verify_suite "$@"
