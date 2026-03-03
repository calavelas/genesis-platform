# Mac Lab Cluster GitOps

This folder represents the `mac/lab` cluster desired state.

## Bootstrap entrypoint
- `core.yaml`: bootstrap ArgoCD `Application` applied to the cluster.

## Subfolders
- `core/`: app-of-apps definitions consumed by bootstrap (`platform` + `services` + `local-gateway` + `internet-gateway`).
- `platform/`: platform child apps (ArgoCD, Traefik).
- `gateway/`: combined gateway resources (Traefik local + Cloudflare internet routes).
- Application-specific HTTPRoutes (for example `plex` and `case`) are owned in each app Helm chart.
- `services/`: one ArgoCD child `Application` manifest per service.
