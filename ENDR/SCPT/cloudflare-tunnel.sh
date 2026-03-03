#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-help}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RUNTIME_DIR="${REPO_ROOT}/.idp/runtime/cloudflare-tunnel"
LOG_DIR="${RUNTIME_DIR}/logs"
PID_FILE="${RUNTIME_DIR}/cloudflared.pid"
LOG_FILE="${LOG_DIR}/cloudflared.log"
CONFIG_FILE="${RUNTIME_DIR}/config.yml"

CLOUDFLARED_CONFIG_DIR="${CLOUDFLARED_CONFIG_DIR:-${HOME}/.cloudflared}"
CLOUDFLARE_TUNNEL_NAME="${CLOUDFLARE_TUNNEL_NAME:-endr-case}"
CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME="${CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME:-}"
CLOUDFLARE_TUNNEL_ORIGIN_URL="${CLOUDFLARE_TUNNEL_ORIGIN_URL:-https://case.k8s.local}"
CLOUDFLARE_TUNNEL_ORIGIN_HOST_HEADER="${CLOUDFLARE_TUNNEL_ORIGIN_HOST_HEADER:-case.k8s.local}"
CLOUDFLARE_TUNNEL_ORIGIN_NO_TLS_VERIFY="${CLOUDFLARE_TUNNEL_ORIGIN_NO_TLS_VERIFY:-true}"

mkdir -p "${LOG_DIR}"
touch "${LOG_FILE}"

usage() {
  cat <<'EOF'
usage: cloudflare-tunnel.sh [login|create|route|setup|start|stop|restart|status|logs|render-config|help]

Environment:
  CLOUDFLARE_TUNNEL_NAME                 Tunnel name (default: endr-case)
  CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME      Public DNS name in your Cloudflare zone (required for route/setup/start)
  CLOUDFLARE_TUNNEL_ORIGIN_URL           Local origin URL (default: https://case.k8s.local)
  CLOUDFLARE_TUNNEL_ORIGIN_HOST_HEADER   Host header sent to origin (default: case.k8s.local)
  CLOUDFLARE_TUNNEL_ORIGIN_NO_TLS_VERIFY Skip origin cert verification (default: true)
  CLOUDFLARED_CONFIG_DIR                 cloudflared credential dir (default: ~/.cloudflared)
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[cloudflare-tunnel] missing required command: $1"
    exit 1
  fi
}

require_public_hostname() {
  if [ -z "${CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME}" ]; then
    echo "[cloudflare-tunnel] CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME is required"
    echo "[cloudflare-tunnel] example: export CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME=case.example.com"
    exit 1
  fi
}

is_pid_running() {
  local pid="$1"
  kill -0 "${pid}" >/dev/null 2>&1
}

pid_for() {
  if [ ! -f "${PID_FILE}" ]; then
    return 1
  fi

  local pid
  pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [ -z "${pid}" ]; then
    return 1
  fi

  if is_pid_running "${pid}"; then
    echo "${pid}"
    return 0
  fi

  rm -f "${PID_FILE}"
  return 1
}

bool_to_yaml() {
  case "$1" in
    1|true|TRUE|True|yes|YES|on|ON)
      echo "true"
      ;;
    *)
      echo "false"
      ;;
  esac
}

find_tunnel_id_json() {
  cloudflared tunnel list --output json 2>/dev/null | python3 - "${CLOUDFLARE_TUNNEL_NAME}" <<'PY'
import json
import sys

name = sys.argv[1]
raw = sys.stdin.read().strip()
if not raw:
    sys.exit(0)

for item in json.loads(raw):
    if isinstance(item, dict) and item.get("name") == name:
        print(item.get("id", ""))
        break
PY
}

find_tunnel_id_text() {
  cloudflared tunnel list 2>/dev/null | awk -v tunnel="${CLOUDFLARE_TUNNEL_NAME}" '$2 == tunnel { print $1; exit }'
}

find_tunnel_id() {
  local tunnel_id=""
  tunnel_id="$(find_tunnel_id_json || true)"
  if [ -n "${tunnel_id}" ]; then
    echo "${tunnel_id}"
    return 0
  fi

  tunnel_id="$(find_tunnel_id_text || true)"
  if [ -n "${tunnel_id}" ]; then
    echo "${tunnel_id}"
    return 0
  fi

  return 1
}

create_tunnel() {
  require_cmd cloudflared
  require_cmd python3

  local tunnel_id=""
  if tunnel_id="$(find_tunnel_id)"; then
    echo "[cloudflare-tunnel] tunnel already exists: ${CLOUDFLARE_TUNNEL_NAME} (${tunnel_id})"
    return 0
  fi

  echo "[cloudflare-tunnel] creating tunnel: ${CLOUDFLARE_TUNNEL_NAME}"
  cloudflared tunnel create "${CLOUDFLARE_TUNNEL_NAME}"

  tunnel_id="$(find_tunnel_id || true)"
  if [ -z "${tunnel_id}" ]; then
    echo "[cloudflare-tunnel] failed to resolve tunnel ID after create"
    exit 1
  fi
  echo "[cloudflare-tunnel] created tunnel: ${CLOUDFLARE_TUNNEL_NAME} (${tunnel_id})"
}

route_dns() {
  require_cmd cloudflared
  require_public_hostname

  local tunnel_id=""
  tunnel_id="$(find_tunnel_id || true)"
  if [ -z "${tunnel_id}" ]; then
    echo "[cloudflare-tunnel] tunnel does not exist yet: ${CLOUDFLARE_TUNNEL_NAME}"
    echo "[cloudflare-tunnel] run: $0 create"
    exit 1
  fi

  echo "[cloudflare-tunnel] routing ${CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME} -> ${CLOUDFLARE_TUNNEL_NAME}"
  cloudflared tunnel route dns "${CLOUDFLARE_TUNNEL_NAME}" "${CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME}"
}

render_config() {
  require_cmd cloudflared
  require_public_hostname

  local tunnel_id=""
  tunnel_id="$(find_tunnel_id || true)"
  if [ -z "${tunnel_id}" ]; then
    echo "[cloudflare-tunnel] tunnel does not exist yet: ${CLOUDFLARE_TUNNEL_NAME}"
    echo "[cloudflare-tunnel] run: $0 create"
    exit 1
  fi

  local credentials_file="${CLOUDFLARED_CONFIG_DIR}/${tunnel_id}.json"
  if [ ! -f "${credentials_file}" ]; then
    echo "[cloudflare-tunnel] tunnel credentials file not found: ${credentials_file}"
    echo "[cloudflare-tunnel] run: cloudflared tunnel login"
    echo "[cloudflare-tunnel] then: cloudflared tunnel create ${CLOUDFLARE_TUNNEL_NAME}"
    exit 1
  fi

  local no_tls_verify
  no_tls_verify="$(bool_to_yaml "${CLOUDFLARE_TUNNEL_ORIGIN_NO_TLS_VERIFY}")"

  cat > "${CONFIG_FILE}" <<EOF
tunnel: ${tunnel_id}
credentials-file: ${credentials_file}
ingress:
  - hostname: ${CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME}
    service: ${CLOUDFLARE_TUNNEL_ORIGIN_URL}
    originRequest:
      httpHostHeader: ${CLOUDFLARE_TUNNEL_ORIGIN_HOST_HEADER}
      noTLSVerify: ${no_tls_verify}
  - service: http_status:404
EOF

  echo "[cloudflare-tunnel] wrote config: ${CONFIG_FILE}"
  echo "[cloudflare-tunnel] origin: ${CLOUDFLARE_TUNNEL_ORIGIN_URL}"
}

start_tunnel() {
  require_cmd cloudflared
  require_public_hostname
  render_config

  local existing_pid=""
  if existing_pid="$(pid_for)"; then
    echo "[cloudflare-tunnel] already running (pid=${existing_pid})"
    return 0
  fi

  nohup cloudflared tunnel --config "${CONFIG_FILE}" run > "${LOG_FILE}" 2>&1 < /dev/null &
  local pid="$!"
  disown "${pid}" 2>/dev/null || true
  echo "${pid}" > "${PID_FILE}"
  sleep 0.7

  if is_pid_running "${pid}"; then
    echo "[cloudflare-tunnel] started (pid=${pid})"
    status_tunnel
  else
    echo "[cloudflare-tunnel] failed to start; check logs: ${LOG_FILE}"
    rm -f "${PID_FILE}"
    exit 1
  fi
}

stop_tunnel() {
  local pid=""
  if ! pid="$(pid_for)"; then
    echo "[cloudflare-tunnel] already stopped"
    rm -f "${PID_FILE}"
    return 0
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

  rm -f "${PID_FILE}"
  echo "[cloudflare-tunnel] stopped"
}

status_tunnel() {
  local pid=""
  if pid="$(pid_for)"; then
    echo "[cloudflare-tunnel] status: running (pid=${pid})"
  else
    echo "[cloudflare-tunnel] status: stopped"
  fi

  echo "[cloudflare-tunnel] tunnel-name: ${CLOUDFLARE_TUNNEL_NAME}"
  if [ -n "${CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME}" ]; then
    echo "[cloudflare-tunnel] public-hostname: ${CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME}"
  else
    echo "[cloudflare-tunnel] public-hostname: <unset>"
  fi
  echo "[cloudflare-tunnel] origin-url: ${CLOUDFLARE_TUNNEL_ORIGIN_URL}"
  echo "[cloudflare-tunnel] origin-host-header: ${CLOUDFLARE_TUNNEL_ORIGIN_HOST_HEADER}"
  echo "[cloudflare-tunnel] no-tls-verify: $(bool_to_yaml "${CLOUDFLARE_TUNNEL_ORIGIN_NO_TLS_VERIFY}")"
  echo "[cloudflare-tunnel] config: ${CONFIG_FILE}"
  echo "[cloudflare-tunnel] logs: ${LOG_FILE}"
}

logs_tunnel() {
  tail -f "${LOG_FILE}"
}

setup_tunnel() {
  create_tunnel
  route_dns
  render_config
}

login_cloudflare() {
  require_cmd cloudflared
  cloudflared tunnel login
}

main() {
  case "${ACTION}" in
    login)
      login_cloudflare
      ;;
    create)
      create_tunnel
      ;;
    route)
      route_dns
      ;;
    setup)
      setup_tunnel
      ;;
    start)
      start_tunnel
      ;;
    stop)
      stop_tunnel
      ;;
    restart)
      stop_tunnel
      start_tunnel
      ;;
    status)
      status_tunnel
      ;;
    logs)
      logs_tunnel
      ;;
    render-config)
      render_config
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
