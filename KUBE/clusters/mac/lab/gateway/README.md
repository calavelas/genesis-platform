# Gateway Resources (`mac/lab`)

This folder contains both Traefik local gateway resources and Cloudflare internet gateway resources.

Files:
- Traefik local:
  - `gateway-traefik.yaml`
  - `gatewaytls-traefik.yaml`
  - `route-traefik-argocd.yaml`
- Cloudflare internet:
  - `gatewayclass-cloudflare.yaml`
  - `gateway-cloudflare.yaml`
  - `route-cloudflare-argocd.yaml`
  - `route-cloudflare-case.yaml`
  - `cloudflare-credentials.yaml` (placeholder secret, replace before production)

`cloudflare-credentials.yaml` is intentionally a placeholder. Do not commit real credentials.
