#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="${ROOT_DIR}/ENDR"
VENV_DIR="${API_DIR}/.venv"

log() {
  echo "[validate-config] $*"
}

if ! command -v python3 >/dev/null 2>&1; then
  log "missing required command: python3"
  exit 1
fi

if [[ ! -d "${VENV_DIR}" ]]; then
  log "creating virtual environment: ${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
fi

log "ensuring idp-api dependencies are installed"
"${VENV_DIR}/bin/python" -m pip install --upgrade pip >/dev/null
"${VENV_DIR}/bin/python" -m pip install -e "${API_DIR}" >/dev/null

log "validating ENDR.yaml and SVCS.yaml"
(
  cd "${API_DIR}"
  IDP_REPO_ROOT="${ROOT_DIR}" "${VENV_DIR}/bin/python" -m TARS.config.loader
)
