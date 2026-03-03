# Space Cluster GitOps

This folder represents the space cluster desired state.

## Bootstrap entrypoint
- `space.yaml`: bootstrap ArgoCD `Application` applied to the cluster.

## Subfolders
- `core/`: app-of-apps core definition consumed by ArgoCD bootstrap.
- `endurance/`: platform-layer GitOps resources (Gateway API, TLS, platform apps).
- `gargantua/`: one ArgoCD child `Application` manifest per service.
