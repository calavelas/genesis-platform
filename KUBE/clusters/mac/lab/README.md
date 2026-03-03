# Mac Lab Cluster GitOps

This folder represents the `mac/lab` cluster desired state.

## Bootstrap entrypoint
- `core.yaml`: bootstrap ArgoCD `Application` applied to the cluster.

## Subfolders
- `core/`: app-of-apps definitions consumed by bootstrap (`platform` + `services`).
- `platform/`: platform child apps (ArgoCD, Traefik, gateways).
- `services/`: one ArgoCD child `Application` manifest per service.
