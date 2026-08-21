#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

HAS_SOURCE=false
HAS_OUTPUT=false
for ARG in "$@"; do
  [[ "${ARG}" == "--source" ]] && HAS_SOURCE=true
  [[ "${ARG}" == "--output" ]] && HAS_OUTPUT=true
done

if [[ "${HAS_SOURCE}" != true || "${HAS_OUTPUT}" != true ]]; then
  echo "Usage: scripts/extract_pdfs.sh --source PATH --output PATH [--config PATH] [--manifest PATH]" >&2
  exit 2
fi

exec "${PYTHON}" -m finetune_lora.pdf_extract "$@"
