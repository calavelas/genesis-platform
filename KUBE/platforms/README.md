# Platform Helm Charts

Vendored Helm charts used for GitOps-managed platform components.

Contents:
- `argocd/helm`: ArgoCD chart (self-managed by ArgoCD `argocd-instance` app).
- `traefik/helm`: Traefik chart used for ingress + Gateway API.

These charts are intentionally stored in-repo so cluster state is fully reproducible from Git.
