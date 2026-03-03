#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}"
ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
MONITORING_NAMESPACE="${MONITORING_NAMESPACE:-monitoring}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[port-forward] missing required command: $1"
    exit 1
  fi
}

pf_argocd() {
  echo "[port-forward] ArgoCD -> http://localhost:8080"
  kubectl -n "$ARGOCD_NAMESPACE" port-forward svc/argocd-server 8080:80
}

pf_grafana() {
  echo "[port-forward] Grafana -> http://localhost:3000"
  kubectl -n "$MONITORING_NAMESPACE" port-forward svc/kube-prometheus-stack-grafana 3000:80
}

pf_prometheus() {
  echo "[port-forward] Prometheus -> http://localhost:9090"
  kubectl -n "$MONITORING_NAMESPACE" port-forward svc/kube-prometheus-stack-prometheus 9090:9090
}

main() {
  require_cmd kubectl

  case "$TARGET" in
    argocd)
      pf_argocd
      ;;
    grafana)
      pf_grafana
      ;;
    prometheus)
      pf_prometheus
      ;;
    all)
      pf_argocd
      ;;
    *)
      echo "usage: $0 [all|argocd|grafana|prometheus]"
      exit 1
      ;;
  esac
}

main "$@"
