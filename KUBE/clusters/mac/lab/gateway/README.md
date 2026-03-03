# Gateway Resources (`mac/lab`)

This folder contains the local Traefik Gateway API resources for `*.k8s.local`.

Files:
- `gateway.yaml`: shared local gateway listeners (`http` + `https`)
- `gateway-tls.yaml`: local wildcard TLS cert for `*.k8s.local`
- `route-argocd.yaml`: local ArgoCD route (`argocd.k8s.local`)

Internet-facing Cloudflare resources are managed in `../internet`.
