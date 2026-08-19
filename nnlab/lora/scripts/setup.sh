#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
VENV_DIR="${PROJECT_ROOT}/.venv"

EXTRAS="dev,train,docs"
MODE="local LoRA training"
if [[ "${1:-}" == "--rag-only" ]]; then
  EXTRAS="dev"
  MODE="local RAG with LM Studio"
elif [[ "${1:-}" == "--mlx" ]]; then
  EXTRAS="dev,mlx,docs"
  MODE="local MLX LoRA/QLoRA training"
elif [[ "${1:-}" == "--train" || -z "${1:-}" ]]; then
  EXTRAS="dev,train,mlx,docs"
elif [[ "${1:-}" == "--cuda" ]]; then
  EXTRAS="dev,train,qlora,docs"
  MODE="local CUDA QLoRA training"
else
  echo "Usage: scripts/setup.sh [--rag-only|--mlx|--train|--cuda]" >&2
  exit 2
fi

PYTHON_BIN=""
if [[ -n "${FINETUNE_PYTHON:-}" ]]; then
  CANDIDATES=("${FINETUNE_PYTHON}")
else
  CANDIDATES=(
    /opt/homebrew/opt/python@3.12/bin/python3.12
    /opt/homebrew/opt/python@3.11/bin/python3.11
    /usr/local/opt/python@3.12/bin/python3.12
    /usr/local/opt/python@3.11/bin/python3.11
    python3.12
    python3.11
  )
fi

for CANDIDATE in "${CANDIDATES[@]}"; do
  if command -v "${CANDIDATE}" >/dev/null 2>&1; then
    if "${CANDIDATE}" -c \
      'import sys; raise SystemExit(not ((3, 11) <= sys.version_info[:2] < (3, 13)))'; then
      PYTHON_BIN="${CANDIDATE}"
      break
    fi
  fi
done

if [[ -z "${PYTHON_BIN}" ]]; then
  echo "Python 3.11 or 3.12 is required for the current PyTorch macOS stack." >&2
  echo "Homebrew example: brew install python@3.12" >&2
  echo "Then run:" >&2
  echo "  FINETUNE_PYTHON=/opt/homebrew/opt/python@3.12/bin/python3.12 scripts/setup.sh" >&2
  exit 2
fi

SELECTED_VERSION="$("${PYTHON_BIN}" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if [[ -x "${VENV_DIR}/bin/python" ]]; then
  VENV_VERSION="$("${VENV_DIR}/bin/python" -c \
    'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  if [[ "${VENV_VERSION}" != "${SELECTED_VERSION}" ]]; then
    echo "Existing .venv uses Python ${VENV_VERSION}; selected Python is ${SELECTED_VERSION}." >&2
    echo "Move or remove ${VENV_DIR}, then run setup again." >&2
    exit 2
  fi
else
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

echo "Using ${PYTHON_BIN} (Python ${SELECTED_VERSION})"
"${VENV_DIR}/bin/python" -m pip install --upgrade pip
"${VENV_DIR}/bin/python" -m pip install -e "${PROJECT_ROOT}[${EXTRAS}]"

echo
echo "Environment ready for ${MODE}."
echo "No model hub login is used. Runtime model access is forced offline."
