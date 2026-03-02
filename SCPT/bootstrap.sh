#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME="${CLUSTER_NAME:-genesis-local}"
K3D_API_PORT="${K3D_API_PORT:-6550}"
ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
KYVERNO_NAMESPACE="${KYVERNO_NAMESPACE:-kyverno}"
MONITORING_NAMESPACE="${MONITORING_NAMESPACE:-monitoring}"

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

install_helm_repos() {
  log "configuring helm repositories"
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
  helm repo add kyverno https://kyverno.github.io/kyverno/ >/dev/null 2>&1 || true
  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
  helm repo update >/dev/null
}

install_ingress() {
  log "installing ingress-nginx"
  helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx \
    --create-namespace \
    --wait \
    --timeout 10m
}

install_argocd() {
  log "installing ArgoCD"
  kubectl create namespace "$ARGOCD_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl apply --server-side --force-conflicts -n "$ARGOCD_NAMESPACE" -f \
    https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml >/dev/null
  kubectl -n "$ARGOCD_NAMESPACE" rollout status deploy/argocd-server --timeout=10m >/dev/null
}

install_kyverno() {
  log "installing Kyverno"
  helm upgrade --install kyverno kyverno/kyverno \
    --namespace "$KYVERNO_NAMESPACE" \
    --create-namespace \
    --wait \
    --timeout 10m
}

install_monitoring() {
  log "installing kube-prometheus-stack"
  helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
    --namespace "$MONITORING_NAMESPACE" \
    --create-namespace \
    --wait \
    --timeout 20m
}

apply_argocd_bootstrap() {
  local bootstrap_file="$ROOT_DIR/KUBE/clusters/space/space.yaml"
  if [[ ! -f "$bootstrap_file" ]]; then
    log "missing file: $bootstrap_file"
    exit 1
  fi

  log "applying ArgoCD bootstrap application"
  kubectl apply -f "$bootstrap_file" >/dev/null
}

print_summary() {
  local argocd_password=""
  local grafana_password=""

  if kubectl -n "$ARGOCD_NAMESPACE" get secret argocd-initial-admin-secret >/dev/null 2>&1; then
    argocd_password="$(kubectl -n "$ARGOCD_NAMESPACE" get secret argocd-initial-admin-secret \
      -o go-template='{{index .data "password" | base64decode}}' 2>/dev/null || true)"
  fi

  if kubectl -n "$MONITORING_NAMESPACE" get secret kube-prometheus-stack-grafana >/dev/null 2>&1; then
    grafana_password="$(kubectl -n "$MONITORING_NAMESPACE" get secret kube-prometheus-stack-grafana \
      -o go-template='{{index .data "admin-password" | base64decode}}' 2>/dev/null || true)"
  fi

  cat <<EOF

[bootstrap] completed
[bootstrap] cluster context: k3d-${CLUSTER_NAME}

URLs (after port-forward):
- ArgoCD:  http://localhost:8080
- Grafana: http://localhost:3000

Commands:
- make -f SCPT/Makefile port-forward

Credentials:
- ArgoCD username: admin
- ArgoCD password: ${argocd_password:-<run kubectl -n ${ARGOCD_NAMESPACE} get secret argocd-initial-admin-secret>}
- Grafana username: admin
- Grafana password: ${grafana_password:-<run kubectl -n ${MONITORING_NAMESPACE} get secret kube-prometheus-stack-grafana>}
EOF
}

main() {
  require_cmd k3d
  require_cmd kubectl
  require_cmd helm

  ensure_cluster
  install_helm_repos
  install_ingress
  install_argocd
  install_kyverno
  install_monitoring
  apply_argocd_bootstrap
  print_summary
}

main "$@"
