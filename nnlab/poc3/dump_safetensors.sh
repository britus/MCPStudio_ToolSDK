#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="${NODE:-$(command -v node)}"

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node executable not found" >&2
  exit 1
fi

exec "$NODE_BIN" "$PROJECT_DIR/dump_safetensors.js" "$@"
