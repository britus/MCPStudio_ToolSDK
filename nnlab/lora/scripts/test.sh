#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

"${PYTHON}" -m ruff check src tests
"${PYTHON}" -m pytest -q
