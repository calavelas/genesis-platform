# Mac Lab Cluster GitOps

This folder represents the `mac/lab` cluster desired state.

## Bootstrap entrypoint
- `core.yaml`: bootstrap ArgoCD `Application` applied to the cluster.

## Subfolders
- `core/`: app-of-apps definitions consumed by bootstrap (`platform` + `services` + `gateway` + `internet-gateway`).
- `platform/`: platform child apps (ArgoCD, Traefik).
- `gateway/`: shared local Traefik Gateway API resources for `*.k8s.local`.
- `internet/`: Cloudflare internet gateway resources (manual sync application).
- Application-specific HTTPRoutes (for example `plex` and `case`) are owned in each app Helm chart.
- `services/`: one ArgoCD child `Application` manifest per service.
