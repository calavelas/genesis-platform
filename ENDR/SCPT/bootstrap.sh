#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLUSTER_NAME="${CLUSTER_NAME:-mac-lab}"
K3D_API_PORT="${K3D_API_PORT:-6550}"
ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
ARGOCD_HELM_CHART="${ARGOCD_HELM_CHART:-$ROOT_DIR/KUBE/platforms/argocd/helm}"
ARGOCD_VALUES="${ARGOCD_VALUES:-$ARGOCD_HELM_CHART/values.yaml}"
BOOTSTRAP_APP_FILE="$ROOT_DIR/KUBE/clusters/mac/lab/core.yaml"
BOOTSTRAP_APP_NAME="${BOOTSTRAP_APP_NAME:-lab}"
BOOTSTRAP_RESET_ARGOCD="${BOOTSTRAP_RESET_ARGOCD:-true}"
CLEANUP_LEGACY_INGRESS_NGINX="${CLEANUP_LEGACY_INGRESS_NGINX:-true}"

log() {
  echo "[bootstrap] $*"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "missing required command: $cmd"
    exit 1
  fi
}

ensure_cluster() {
  if k3d cluster get "$CLUSTER_NAME" >/dev/null 2>&1; then
    log "k3d cluster '$CLUSTER_NAME' already exists"
  else
    log "creating k3d cluster '$CLUSTER_NAME'"
    k3d cluster create "$CLUSTER_NAME" \
      --servers 1 \
      --agents 2 \
      --api-port "${K3D_API_PORT}" \
      --wait \
      --port "80:80@loadbalancer" \
      --port "443:443@loadbalancer" \
      --k3s-arg "--disable=traefik@server:0"
  fi

  kubectl config use-context "k3d-${CLUSTER_NAME}" >/dev/null
}

cleanup_legacy_ingress_nginx() {
  if [[ "${CLEANUP_LEGACY_INGRESS_NGINX}" != "true" ]]; then
    return 0
  fi

  if kubectl get namespace ingress-nginx >/dev/null 2>&1; then
    log "removing legacy ingress-nginx to free host ports 80/443 for Traefik"
    if helm -n ingress-nginx ls --short 2>/dev/null | grep -qx "ingress-nginx"; then
      helm -n ingress-nginx uninstall ingress-nginx >/dev/null || true
    fi
    kubectl delete namespace ingress-nginx --wait=true --timeout=5m >/dev/null || true
  fi
}

install_argocd_from_chart() {
  if [[ ! -d "$ARGOCD_HELM_CHART" ]]; then
    log "missing ArgoCD chart directory: $ARGOCD_HELM_CHART"
    exit 1
  fi

  if [[ ! -f "$ARGOCD_VALUES" ]]; then
    log "missing ArgoCD values file: $ARGOCD_VALUES"
    exit 1
  fi

  if [[ "${BOOTSTRAP_RESET_ARGOCD}" == "true" ]] && kubectl get namespace "$ARGOCD_NAMESPACE" >/dev/null 2>&1; then
    log "resetting existing namespace '$ARGOCD_NAMESPACE' for deterministic GitOps bootstrap"
    kubectl delete namespace "$ARGOCD_NAMESPACE" --wait=true --timeout=10m >/dev/null || true
    for _ in $(seq 1 120); do
      if ! kubectl get namespace "$ARGOCD_NAMESPACE" >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
  fi

  log "ensuring namespace '$ARGOCD_NAMESPACE'"
  kubectl create namespace "$ARGOCD_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

  local temp_manifest
  temp_manifest="$(mktemp)"

  log "rendering ArgoCD chart from repository"
  helm template argocd "$ARGOCD_HELM_CHART" \
    --namespace "$ARGOCD_NAMESPACE" \
    -f "$ARGOCD_VALUES" > "$temp_manifest"

  log "applying rendered ArgoCD manifests"
  kubectl apply -n "$ARGOCD_NAMESPACE" -f "$temp_manifest" --server-side >/dev/null
  rm -f "$temp_manifest"

  log "waiting for ArgoCD components to be ready"
  kubectl -n "$ARGOCD_NAMESPACE" rollout status statefulset/argocd-application-controller --timeout=10m >/dev/null
  kubectl -n "$ARGOCD_NAMESPACE" rollout status deploy/argocd-server --timeout=10m >/dev/null
}

apply_argocd_bootstrap() {
  if [[ ! -f "$BOOTSTRAP_APP_FILE" ]]; then
    log "missing bootstrap application file: $BOOTSTRAP_APP_FILE"
    exit 1
  fi

  log "using bootstrap application file: $BOOTSTRAP_APP_FILE"
  log "applying ArgoCD bootstrap application"
  kubectl apply -f "$BOOTSTRAP_APP_FILE" >/dev/null
}

print_summary() {
  local argocd_password=""

  if kubectl -n "$ARGOCD_NAMESPACE" get secret argocd-initial-admin-secret >/dev/null 2>&1; then
    argocd_password="$(kubectl -n "$ARGOCD_NAMESPACE" get secret argocd-initial-admin-secret \
      -o go-template='{{index .data "password" | base64decode}}' 2>/dev/null || true)"
  fi

  cat <<EOF_SUMMARY

[bootstrap] completed
[bootstrap] cluster context: k3d-${CLUSTER_NAME}

GitOps bootstrap:
- Root application: ${BOOTSTRAP_APP_NAME}
- Core child applications: platform, services, gateway
- Platform applications: argocd-instance, traefik

URLs:
- ArgoCD (gateway):  https://argocd.k8s.local
- ArgoCD (port-forward): https://127.0.0.1:18443
- ENDR UI/API (gateway): https://case.k8s.local, https://api.k8s.local
- Services (gateway): https://mann.k8s.local, https://miller.k8s.local, https://edmund.k8s.local

Commands:
- make -f ENDR/SCPT/Makefile dev-start
- make -f ENDR/SCPT/Makefile port-forward-argocd

Credentials:
- ArgoCD username: admin
- ArgoCD password: ${argocd_password:-<run kubectl -n ${ARGOCD_NAMESPACE} get secret argocd-initial-admin-secret>}

Hosts entries for local testing (if needed):
- 127.0.0.1 argocd.k8s.local case.k8s.local api.k8s.local mann.k8s.local miller.k8s.local edmund.k8s.local
EOF_SUMMARY
}

main() {
  require_cmd k3d
  require_cmd kubectl
  require_cmd helm

  ensure_cluster
  cleanup_legacy_ingress_nginx
  install_argocd_from_chart
  apply_argocd_bootstrap
  print_summary
}

main "$@"
