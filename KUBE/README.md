# KUBE (Infrastructure Layer)

`KUBE` contains local Kubernetes and GitOps infrastructure manifests.

## Subfolders
- `argocd/`: ArgoCD bootstrap application manifest.
- `clusters/`: cluster-specific app-of-apps structure and generated child apps.
- `policies/`: policy-as-code assets (Kyverno).
- `monitoring/`: monitoring stack notes/configuration.

## Role in GitOps Flow
1. Bootstrap installs ArgoCD.
2. `KUBE/clusters/space/space.yaml` creates the bootstrap ArgoCD application.
3. Root app syncs child applications from `KUBE/clusters/space/gargantua`.
4. Each child app deploys one service from `SVCS/<name>/chart`.
