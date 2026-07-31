#!/usr/bin/env bash
#
# Continue training the causal model and immediately show generative inference.
# Usage: ./train_and_infer.sh [dataset] [prompt]
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

NODE="${NODE:-$(command -v node)}"
DATASET="${1:-dataset.txt}"

if [ -z "$NODE" ]; then
  echo "ERROR: node executable not found" >&2
  exit 1
fi
if [ ! -f "$DATASET" ]; then
  echo "ERROR: dataset file not found: $DATASET" >&2
  exit 1
fi

echo "Continuing training on $DATASET ..."
"$NODE" train.js "$DATASET" > train_output.json
