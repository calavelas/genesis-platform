# KUBE (Infrastructure Layer)

`KUBE` contains local Kubernetes and GitOps infrastructure manifests.

## Subfolders
- `argocd/`: ArgoCD bootstrap application manifest.
- `clusters/`: cluster-specific app-of-apps structure and generated child apps.
- `platforms/`: vendored platform Helm charts managed by GitOps (ArgoCD, Traefik).
- `policies/`: policy-as-code assets (Kyverno).
- `monitoring/`: monitoring stack notes/configuration.

## Role in GitOps Flow
1. Bootstrap installs ArgoCD.
2. `KUBE/clusters/space/space.yaml` creates the bootstrap ArgoCD application.
3. Root app syncs platform + service child applications from `KUBE/clusters/space/core`.
4. Platform apps deploy ArgoCD self-management, Traefik, and gateway routes.
5. Service apps deploy charts from `SVCS/<name>/chart`.
