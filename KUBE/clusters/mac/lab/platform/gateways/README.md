# Space Gateway Resources

Gateway API resources used to expose ArgoCD and service endpoints on `*.k8s.local`.

Resources:
- `k8s-local-tls.yaml`: TLS secret for wildcard local domain.
- `k8s-gateway.yaml`: shared HTTP/HTTPS Gateway using Traefik GatewayClass.
- `argocd-route.yaml`: route for `argocd.k8s.local` to `argocd-server`.
