#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

CONFIG=""
ADAPTER=""
MERGED_DIR=""
F16_FILE=""
OUTPUT_FILE=""
QUANTIZATION="Q4_K_M"
LLAMA_CPP_DIR="${LLAMA_CPP:-}"

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="${2:-}"; shift 2 ;;
    --adapter) ADAPTER="${2:-}"; shift 2 ;;
    --merged-dir) MERGED_DIR="${2:-}"; shift 2 ;;
    --f16-output) F16_FILE="${2:-}"; shift 2 ;;
    --output) OUTPUT_FILE="${2:-}"; shift 2 ;;
    --quantization) QUANTIZATION="${2:-}"; shift 2 ;;
    --llama-cpp) LLAMA_CPP_DIR="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${CONFIG}" || -z "${ADAPTER}" || -z "${MERGED_DIR}" || -z "${F16_FILE}" || -z "${OUTPUT_FILE}" ]]; then
  echo "Usage: scripts/export_gguf.sh --config CONFIG --adapter PATH --merged-dir PATH --f16-output FILE --output FILE [--quantization TYPE] [--llama-cpp PATH]" >&2
  exit 2
fi

if [[ -z "${LLAMA_CPP_DIR}" || ! -f "${LLAMA_CPP_DIR}/convert_hf_to_gguf.py" ]]; then
  echo "Set LLAMA_CPP to a current llama.cpp checkout." >&2
  echo "Pass --llama-cpp PATH or set LLAMA_CPP." >&2
  exit 2
fi

"${PYTHON}" -m finetune_lora.merge \
  --config "${CONFIG}" \
  --adapter "${ADAPTER}" \
  --output "${MERGED_DIR}" \
  --dtype float16

"${PYTHON}" "${LLAMA_CPP_DIR}/convert_hf_to_gguf.py" \
  "${MERGED_DIR}" \
  --outfile "${F16_FILE}" \
  --outtype f16

QUANTIZER=""
for CANDIDATE in \
  "${LLAMA_CPP_DIR}/build/bin/llama-quantize" \
  "${LLAMA_CPP_DIR}/llama-quantize" \
  "${LLAMA_CPP_DIR}/quantize"; do
  if [[ -x "${CANDIDATE}" ]]; then
    QUANTIZER="${CANDIDATE}"
    break
  fi
done

if [[ -z "${QUANTIZER}" ]]; then
  echo "llama.cpp quantizer not found. Build llama.cpp first." >&2
  echo "The unquantized file is available at ${F16_FILE}" >&2
  exit 2
fi

"${QUANTIZER}" "${F16_FILE}" "${OUTPUT_FILE}" "${QUANTIZATION}"
echo "GGUF ready: ${OUTPUT_FILE}"
echo "Import this file into LM Studio or select it in an EoF MCP Studio llama.cpp runtime."
