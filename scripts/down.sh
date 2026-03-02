#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-genesis-local}"

if ! command -v k3d >/dev/null 2>&1; then
  echo "[down] missing required command: k3d"
  exit 1
fi

if k3d cluster get "$CLUSTER_NAME" >/dev/null 2>&1; then
  echo "[down] deleting cluster '$CLUSTER_NAME'"
  k3d cluster delete "$CLUSTER_NAME"
  echo "[down] cluster deleted"
else
  echo "[down] cluster '$CLUSTER_NAME' does not exist, nothing to do"
fi
