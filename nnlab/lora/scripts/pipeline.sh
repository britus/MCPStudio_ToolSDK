#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

CONFIG=""
INPUTS=()
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="${2:-}"; shift 2 ;;
    --input) INPUTS+=("${2:-}"); shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${CONFIG}" || "${#INPUTS[@]}" -eq 0 ]]; then
  echo "Usage: scripts/pipeline.sh --config CONFIG --input PATH [--input PATH ...]" >&2
  exit 2
fi

PREPARE_ARGS=(--config "${CONFIG}")
INDEX_ARGS=(--config "${CONFIG}" build)
for INPUT_PATH in "${INPUTS[@]}"; do
  PREPARE_ARGS+=(--input "${INPUT_PATH}")
  INDEX_ARGS+=(--project "${INPUT_PATH}")
done

"${PROJECT_ROOT}/scripts/prepare.sh" "${PREPARE_ARGS[@]}"
"${PROJECT_ROOT}/scripts/index.sh" "${INDEX_ARGS[@]}"
"${PROJECT_ROOT}/scripts/train.sh" --config "${CONFIG}"
