# Mac Lab Cluster GitOps

This folder represents the `mac/lab` cluster desired state.

## Bootstrap entrypoint
- `core.yaml`: bootstrap ArgoCD `Application` applied to the cluster.

## Subfolders
- `core/`: app-of-apps definitions consumed by bootstrap (`platform` + `services` + `gateway`).
- `platform/`: platform child apps (ArgoCD, Traefik).
- `gateway/`: Gateway API resources (Gateway, HTTPRoutes, TLS secret).
- `services/`: one ArgoCD child `Application` manifest per service.
