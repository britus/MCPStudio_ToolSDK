#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
VENV_DIR="${PROJECT_ROOT}/.venv"

cd "${PROJECT_ROOT}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  echo "Virtual environment missing. Run: scripts/setup.sh" >&2
  exit 1
fi

PYTHON="${VENV_DIR}/bin/python"

# Never let Transformers contact a model hub. Training weights must exist locally.
export HF_HUB_OFFLINE=1
export HF_HUB_DISABLE_TELEMETRY=1
export TRANSFORMERS_OFFLINE=1
export DO_NOT_TRACK=1
