#!/usr/bin/env bash
# Start the simulator on this machine only (http://127.0.0.1:8767/circuit/).
set -euo pipefail
cd "$(dirname "$0")/../server"
PY="${PYTHON:-../.venv/bin/python}"
exec "$PY" -m uvicorn app:app --host "${GW_HOST:-127.0.0.1}" --port "${GW_PORT:-8767}"
