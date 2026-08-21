#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
PYTHON="${PROJECT_ROOT}/.venv/bin/python"

cd "${PROJECT_ROOT}"
if [[ ! -x "${PYTHON}" ]]; then
  echo "Virtual environment missing. Run: scripts/setup.sh --mlx" >&2
  exit 1
fi

exec "${PYTHON}" -m finetune_lora.docling_poc "$@"
