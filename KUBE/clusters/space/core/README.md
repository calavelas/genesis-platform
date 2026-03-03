# Core App (App-of-Apps)

Defines the ArgoCD root application for space cluster deployment.

Files:
- `gargantua.yaml`: points ArgoCD at `KUBE/clusters/space/gargantua`.
- `argocd-instance.yaml`: ArgoCD self-management app (patched ignore-diff settings).
- `traefik.yaml`: Traefik platform app.
- `plt-gateway.yaml`: gateway-routes app (ArgoCD + service exposure).
- `kustomization.yaml`: groups core resources.
