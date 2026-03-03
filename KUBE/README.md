# KUBE (Infrastructure Layer)

`KUBE` contains local Kubernetes and GitOps infrastructure manifests.

## Subfolders
- `clusters/`: cluster-specific app-of-apps structure and generated child apps.
- `platforms/`: vendored platform Helm charts managed by GitOps (ArgoCD, Traefik).
- `policies/`: policy-as-code assets (Kyverno).
- `monitoring/`: monitoring stack notes/configuration.
- `argocd/`: legacy bootstrap manifests kept for reference.

## Role in GitOps Flow
1. Bootstrap installs ArgoCD.
2. `KUBE/clusters/mac/lab/core.yaml` creates the bootstrap ArgoCD application.
3. Root app syncs `platform` + `services` child applications from `KUBE/clusters/mac/lab/core`.
4. Platform apps deploy ArgoCD self-management, Traefik, and gateway routes.
5. Service apps deploy charts from `SVCS/<name>/chart`.
