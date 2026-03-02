# Local Cluster GitOps

This folder represents the local cluster desired state.

## Subfolders
- `root-app/`: app-of-apps root definition consumed by ArgoCD bootstrap.
- `apps/`: one ArgoCD child `Application` manifest per service.
