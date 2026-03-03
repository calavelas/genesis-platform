# Core App (App-of-Apps)

Defines the ArgoCD root application for the `mac/lab` cluster.

Files:
- `platform.yaml`: points ArgoCD at `KUBE/clusters/mac/lab/platform`.
- `service.yaml`: points ArgoCD at `KUBE/clusters/mac/lab/services`.
- `gateway-traefik.yaml`: local Traefik gateway app (`KUBE/clusters/mac/lab/gateway`, `*traefik*.yaml`).
- `gateway-cloudflare.yaml`: Cloudflare internet gateway app (`KUBE/clusters/mac/lab/gateway`, `*cloudflare*.yaml`).
- `kustomization.yaml`: groups core child applications.
