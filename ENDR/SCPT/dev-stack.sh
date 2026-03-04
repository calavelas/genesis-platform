#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-start}"
LOG_TARGET="${2:-all}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RUNTIME_DIR="${REPO_ROOT}/.idp/runtime/dev-stack"
LOG_DIR="${RUNTIME_DIR}/logs"

# Preferred names for local stack roles.
PLEX_HOST="${PLEX_HOST:-${BACKEND_HOST:-127.0.0.1}}"
PLEX_PORT="${PLEX_PORT:-${BACKEND_PORT:-8000}}"
CASE_HOST="${CASE_HOST:-${FRONTEND_HOST:-127.0.0.1}}"
CASE_PORT="${CASE_PORT:-${FRONTEND_PORT:-3000}}"
ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
ARGOCD_LOCAL_PORT="${ARGOCD_LOCAL_PORT:-18443}"
ARGOCD_REMOTE_PORT="${ARGOCD_REMOTE_PORT:-443}"
ENABLE_ARGOCD_PORT_FORWARD="${ENABLE_ARGOCD_PORT_FORWARD:-false}"

argocd_port_forward_enabled() {
  case "${ENABLE_ARGOCD_PORT_FORWARD}" in
    1|true|TRUE|True|yes|YES|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if [ -z "${ARGOCD_BASE_URL:-}" ]; then
  if argocd_port_forward_enabled; then
    ARGOCD_BASE_URL="https://127.0.0.1:${ARGOCD_LOCAL_PORT}"
  else
    ARGOCD_BASE_URL="https://argocd.k8s.local"
  fi
fi

PLEX_ARGOCD_SERVER="${PLEX_ARGOCD_SERVER:-${ARGOCD_BASE_URL}}"
PLEX_ARGOCD_TOKEN="${PLEX_ARGOCD_TOKEN:-}"
PLEX_ARGOCD_VERIFY_TLS="${PLEX_ARGOCD_VERIFY_TLS:-false}"
CASE_ARGOCD_EMBED_URL="${CASE_ARGOCD_EMBED_URL:-${ARGOCD_BASE_URL}/applications}"
ENDR_API_URL="${ENDR_API_URL:-http://${PLEX_HOST}:${PLEX_PORT}}"

BACKEND_PID_FILE="${RUNTIME_DIR}/backend.pid"
FRONTEND_PID_FILE="${RUNTIME_DIR}/frontend.pid"
ARGOCD_PID_FILE="${RUNTIME_DIR}/argocd-port-forward.pid"

BACKEND_LOG_FILE="${LOG_DIR}/backend.log"
FRONTEND_LOG_FILE="${LOG_DIR}/frontend.log"
ARGOCD_LOG_FILE="${LOG_DIR}/argocd-port-forward.log"

mkdir -p "${LOG_DIR}"
touch "${BACKEND_LOG_FILE}" "${FRONTEND_LOG_FILE}" "${ARGOCD_LOG_FILE}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[dev-stack] missing required command: $1"
    exit 1
  fi
}

require_backend_python() {
  if [ ! -x "${REPO_ROOT}/ENDR/.venv/bin/python" ]; then
    echo "[dev-stack] missing ENDR virtualenv python at ENDR/.venv/bin/python"
    echo "[dev-stack] create it first, for example:"
    echo "  cd ${REPO_ROOT}/ENDR && python3 -m venv .venv && .venv/bin/pip install -e ."
    exit 1
  fi
}

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

pid_for() {
  local pid_file="$1"
  if [ ! -f "${pid_file}" ]; then
    return 1
  fi

  local pid
  pid="$(cat "${pid_file}" 2>/dev/null || true)"
  if [ -z "${pid}" ]; then
    return 1
  fi

  if is_pid_running "${pid}"; then
    echo "${pid}"
    return 0
  fi

  rm -f "${pid_file}"
  return 1
}

start_process() {
  local name="$1"
  local cmd="$2"
  local pid_file="$3"
  local log_file="$4"

  local existing_pid=""
  if existing_pid="$(pid_for "${pid_file}")"; then
    echo "[dev-stack] ${name} already running (pid=${existing_pid})"
    return
  fi

  nohup bash -lc "${cmd}" > "${log_file}" 2>&1 < /dev/null &
  local pid="$!"
  disown "${pid}" 2>/dev/null || true
  echo "${pid}" > "${pid_file}"
  sleep 0.5

  if is_pid_running "${pid}"; then
    echo "[dev-stack] ${name} started (pid=${pid})"
  else
    echo "[dev-stack] failed to start ${name}; check ${log_file}"
    rm -f "${pid_file}"
    exit 1
  fi
}

stop_process() {
  local name="$1"
  local pid_file="$2"

  local pid=""
  if ! pid="$(pid_for "${pid_file}")"; then
    echo "[dev-stack] ${name} already stopped"
    rm -f "${pid_file}"
    return
  fi

  kill "${pid}" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    if ! is_pid_running "${pid}"; then
      break
    fi
    sleep 0.2
  done

  if is_pid_running "${pid}"; then
    kill -9 "${pid}" >/dev/null 2>&1 || true
  fi

  rm -f "${pid_file}"
  echo "[dev-stack] ${name} stopped"
}

print_status_line() {
  local name="$1"
  local pid_file="$2"
  local url="$3"

  local pid=""
  if pid="$(pid_for "${pid_file}")"; then
    echo "[dev-stack] ${name}: running (pid=${pid}) ${url}"
  else
    echo "[dev-stack] ${name}: stopped ${url}"
  fi
}

show_logs() {
  case "${LOG_TARGET}" in
    plex|backend)
      tail -f "${BACKEND_LOG_FILE}"
      ;;
    case|frontend)
      tail -f "${FRONTEND_LOG_FILE}"
      ;;
    argocd)
      tail -f "${ARGOCD_LOG_FILE}"
      ;;
    all)
      if argocd_port_forward_enabled; then
        tail -f "${BACKEND_LOG_FILE}" "${FRONTEND_LOG_FILE}" "${ARGOCD_LOG_FILE}"
      else
        tail -f "${BACKEND_LOG_FILE}" "${FRONTEND_LOG_FILE}"
      fi
      ;;
    *)
      echo "usage: $0 logs [all|plex|case|argocd] (legacy: backend|frontend)"
      exit 1
      ;;
  esac
}

start_all() {
  require_cmd bash
  require_cmd npm
  require_backend_python
  if argocd_port_forward_enabled; then
    require_cmd kubectl
  fi

  start_process \
    "plex" \
    "cd '${REPO_ROOT}' && export PLEX_ARGOCD_SERVER='${PLEX_ARGOCD_SERVER}' && export PLEX_ARGOCD_TOKEN='${PLEX_ARGOCD_TOKEN}' && export PLEX_ARGOCD_VERIFY_TLS='${PLEX_ARGOCD_VERIFY_TLS}' && exec '${REPO_ROOT}/ENDR/.venv/bin/python' -m uvicorn TARS.api.main:app --reload --host '${PLEX_HOST}' --port '${PLEX_PORT}' --app-dir ENDR" \
    "${BACKEND_PID_FILE}" \
    "${BACKEND_LOG_FILE}"

  start_process \
    "case" \
    "cd '${REPO_ROOT}/ENDR/CASE' && export ENDR_API_URL='${ENDR_API_URL}' && export CASE_ARGOCD_EMBED_URL='${CASE_ARGOCD_EMBED_URL}' && exec npm run dev -- --hostname '${CASE_HOST}' --port '${CASE_PORT}'" \
    "${FRONTEND_PID_FILE}" \
    "${FRONTEND_LOG_FILE}"

  if argocd_port_forward_enabled; then
    start_process \
      "argocd-port-forward" \
      "exec kubectl -n '${ARGOCD_NAMESPACE}' port-forward svc/argocd-server '${ARGOCD_LOCAL_PORT}:${ARGOCD_REMOTE_PORT}'" \
      "${ARGOCD_PID_FILE}" \
      "${ARGOCD_LOG_FILE}"
  else
    stop_process "argocd-port-forward" "${ARGOCD_PID_FILE}" >/dev/null 2>&1 || true
  fi

  status_all
}

stop_all() {
  stop_process "argocd-port-forward" "${ARGOCD_PID_FILE}"
  stop_process "case" "${FRONTEND_PID_FILE}"
  stop_process "plex" "${BACKEND_PID_FILE}"
}

status_all() {
  print_status_line "plex" "${BACKEND_PID_FILE}" "-> http://${PLEX_HOST}:${PLEX_PORT}"
  print_status_line "case" "${FRONTEND_PID_FILE}" "-> http://${CASE_HOST}:${CASE_PORT}"
  if argocd_port_forward_enabled; then
    print_status_line "argocd-port-forward" "${ARGOCD_PID_FILE}" "-> https://127.0.0.1:${ARGOCD_LOCAL_PORT}"
  else
    echo "[dev-stack] argocd-port-forward: disabled (using direct URL)"
  fi
  echo "[dev-stack] argocd-base-url: ${ARGOCD_BASE_URL}"
  echo "[dev-stack] plex-argocd-server: ${PLEX_ARGOCD_SERVER}"
  echo "[dev-stack] case-argocd-embed: ${CASE_ARGOCD_EMBED_URL}"
}

main() {
  case "${ACTION}" in
    start)
      start_all
      ;;
    stop)
      stop_all
      ;;
    restart)
      stop_all
      start_all
      ;;
    status)
      status_all
      ;;
    logs)
      show_logs
      ;;
    *)
      echo "usage: $0 [start|stop|restart|status|logs [all|backend|frontend|argocd]]"
      exit 1
      ;;
  esac
}

main "$@"
