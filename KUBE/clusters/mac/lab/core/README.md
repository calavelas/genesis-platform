# Core App (App-of-Apps)

Defines the ArgoCD root application for the `mac/lab` cluster.

Files:
- `platform.yaml`: points ArgoCD at `KUBE/clusters/mac/lab/platform`.
- `service.yaml`: points ArgoCD at `KUBE/clusters/mac/lab/services`.
- `gateway.yaml`: points ArgoCD at `KUBE/clusters/mac/lab/gateway`.
- `kustomization.yaml`: groups core child applications.
