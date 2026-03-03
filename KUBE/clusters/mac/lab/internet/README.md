# Internet Gateway Resources (`mac/lab`)

This folder contains Cloudflare Gateway API resources for internet exposure through Cloudflare Tunnel.

## Cloudflare internet route (ArgoCD)

Files:
- `cloudflare-gatewayclass.yaml`: `GatewayClass` using controller `github.com/pl4nty/cloudflare-kubernetes-gateway`
- `cloudflare-gateway.yaml`: Cloudflare-managed `Gateway` (`cloudflare-gateway/internet`)
- `route-argocd-internet.yaml`: internet `HTTPRoute` for ArgoCD
- `route-case-internet.yaml`: internet `HTTPRoute` for CASE dashboard

Before syncing internet routes:
1. Set your public hostnames:
   - `route-argocd-internet.yaml` (replace `argocd.example.com`)
   - `route-case-internet.yaml` (replace `case.example.com`)
2. Set valid Cloudflare credentials in `cloudflare-credentials.yaml`:

```bash
kubectl -n cloudflare-gateway create secret generic cloudflare \
  --from-literal=ACCOUNT_ID='<cloudflare-account-id>' \
  --from-literal=TOKEN='<cloudflare-api-token>' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Do not commit real credentials into Git.

Required API token permissions:
- `Account > Cloudflare Tunnel: Edit`
- `Zone > DNS: Edit`

ArgoCD app:
- `internet-gateway` (from `KUBE/clusters/mac/lab/core/internet.yaml`)
- this app is intentionally **manual sync** (no automated sync policy) so you can apply credentials and hostnames first
