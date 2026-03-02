#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

CLUSTER_NAME="${CLUSTER_NAME:-genesis-local}"
ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
KYVERNO_NAMESPACE="${KYVERNO_NAMESPACE:-kyverno}"
MONITORING_NAMESPACE="${MONITORING_NAMESPACE:-monitoring}"
API_PORT="${API_PORT:-18000}"

API_DIR="$ROOT_DIR/apps/idp-api"
VENV_DIR="$API_DIR/.venv"

TMP_DIR="$(mktemp -d)"
API_PID=""

log() {
  echo "[smoke-test] $*"
}

cleanup() {
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" >/dev/null 2>&1; then
    kill "${API_PID}" >/dev/null 2>&1 || true
    wait "${API_PID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT INT TERM

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "missing required command: ${cmd}"
    exit 1
  fi
}

setup_python_env() {
  require_cmd python3

  if [[ ! -d "${VENV_DIR}" ]]; then
    log "creating virtual environment: ${VENV_DIR}"
    python3 -m venv "${VENV_DIR}"
  fi

  log "installing idp-api dependencies"
  "${VENV_DIR}/bin/python" -m pip install --upgrade pip >/dev/null
  "${VENV_DIR}/bin/pip" install -e "${API_DIR}" >/dev/null
}

validate_config_loader() {
  log "running config loader validation"
  (
    cd "${API_DIR}"
    IDP_REPO_ROOT="${ROOT_DIR}" "${VENV_DIR}/bin/python" -m app.config.loader
  ) >"${TMP_DIR}/config-loader.json"

  log "config loader output:"
  cat "${TMP_DIR}/config-loader.json"
}

start_api() {
  log "starting idp-api on 127.0.0.1:${API_PORT}"
  (
    cd "${API_DIR}"
    IDP_REPO_ROOT="${ROOT_DIR}" "${VENV_DIR}/bin/python" -m uvicorn app.main:app \
      --host 127.0.0.1 \
      --port "${API_PORT}"
  ) >"${TMP_DIR}/idp-api.log" 2>&1 &
  API_PID="$!"

  for _ in $(seq 1 40); do
    if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >"${TMP_DIR}/health.json" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done

  log "idp-api did not become ready in time"
  log "api log:"
  cat "${TMP_DIR}/idp-api.log"
  exit 1
}

assert_health_json() {
  "${VENV_DIR}/bin/python" - "${TMP_DIR}/health.json" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)

if data.get("status") != "ok":
    raise SystemExit(f"unexpected health.status: {data.get('status')!r}")
if data.get("configValid") is not True:
    raise SystemExit(f"unexpected health.configValid: {data.get('configValid')!r}")
PY
}

run_api_checks() {
  setup_python_env
  validate_config_loader
  start_api

  log "checking /api/health"
  curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >"${TMP_DIR}/health.json"
  assert_health_json

  log "checking /api/config/validate"
  curl -fsS "http://127.0.0.1:${API_PORT}/api/config/validate" >"${TMP_DIR}/config-validate.json"

  log "checking /api/config"
  curl -fsS "http://127.0.0.1:${API_PORT}/api/config" >"${TMP_DIR}/config.json"

  log "api smoke checks passed"
}

run_platform_checks() {
  require_cmd k3d
  require_cmd kubectl
  require_cmd helm
  require_cmd bash

  log "running bootstrap"
  CLUSTER_NAME="${CLUSTER_NAME}" bash "${ROOT_DIR}/scripts/bootstrap.sh"

  log "verifying kubernetes context"
  kubectl config use-context "k3d-${CLUSTER_NAME}" >/dev/null

  log "verifying required namespaces"
  kubectl get ns ingress-nginx "${ARGOCD_NAMESPACE}" "${KYVERNO_NAMESPACE}" "${MONITORING_NAMESPACE}" >/dev/null

  log "verifying ArgoCD server rollout"
  kubectl -n "${ARGOCD_NAMESPACE}" rollout status deploy/argocd-server --timeout=10m >/dev/null

  log "verifying helm releases"
  helm -n "${KYVERNO_NAMESPACE}" status kyverno >/dev/null
  helm -n "${MONITORING_NAMESPACE}" status kube-prometheus-stack >/dev/null

  log "verifying ArgoCD root application"
  kubectl -n "${ARGOCD_NAMESPACE}" get application root-app >/dev/null

  log "platform smoke checks passed"
}

main() {
  case "${MODE}" in
    all)
      run_api_checks
      run_platform_checks
      ;;
    api)
      run_api_checks
      ;;
    platform)
      run_platform_checks
      ;;
    *)
      echo "usage: $0 [all|api|platform]"
      exit 1
      ;;
  esac

  log "completed successfully (${MODE})"
}

main

