# SCPT (Scripts + Automation Entry)

`SCPT` contains local automation scripts and the main project `Makefile`.

## Key files
- `Makefile`: primary command interface (`bootstrap`, `svcs-check`, `api`, `web`, smoke tests).
- `bootstrap.sh`: creates local cluster, installs ArgoCD from in-repo chart, and applies GitOps root app.
- `dev-stack.sh`: starts/stops local backend + frontend with PID/log management, and can optionally run ArgoCD port-forward.
- `validate-config.sh`: validates `ENDR.yaml` and `SVCS.yaml`.
- `smoke-test.sh`: API/platform smoke test runner.
- `ci/`: CI helper scripts invoked by GitHub Actions.

## Common usage
```bash
make -f ENDR/SCPT/Makefile bootstrap
make -f ENDR/SCPT/Makefile validate-config
make -f ENDR/SCPT/Makefile svcs-check
make -f ENDR/SCPT/Makefile dev-start
make -f ENDR/SCPT/Makefile dev-status
make -f ENDR/SCPT/Makefile dev-stop
```

Bootstrap environment overrides:
- `CLUSTER_NAME`, `K3D_API_PORT`
- `ARGOCD_NAMESPACE`
- `ARGOCD_HELM_CHART`, `ARGOCD_VALUES`
- Bootstrap app file is fixed to `KUBE/clusters/mac/lab/core.yaml`
- `BOOTSTRAP_RESET_ARGOCD` (default `true`; set `false` to keep existing `argocd` namespace)
- `CLEANUP_LEGACY_INGRESS_NGINX` (default `true`; removes old ingress-nginx to avoid 80/443 conflicts)

## Local Stack Init Script
Use `dev-stack.sh` to run the full local stack:
- Backend API on `http://127.0.0.1:8000`
- CASE frontend on `http://127.0.0.1:3000`
- ArgoCD defaults to gateway URL `https://argocd.k8s.local`
- Optional ArgoCD port-forward on `https://127.0.0.1:18443`

```bash
bash ENDR/SCPT/dev-stack.sh start
bash ENDR/SCPT/dev-stack.sh status
bash ENDR/SCPT/dev-stack.sh logs all
bash ENDR/SCPT/dev-stack.sh stop
```

Environment overrides:
- `BACKEND_HOST`, `BACKEND_PORT`
- `FRONTEND_HOST`, `FRONTEND_PORT`
- `ENDR_API_URL`
- `ENABLE_ARGOCD_PORT_FORWARD` (default `false`; set `true` to start `kubectl port-forward`)
- `ARGOCD_NAMESPACE`, `ARGOCD_LOCAL_PORT`, `ARGOCD_REMOTE_PORT`
- `ARGOCD_BASE_URL` (default `https://argocd.k8s.local`; when port-forward is enabled and this is unset, defaults to `https://127.0.0.1:18443`)
- `PLEX_ARGOCD_SERVER`, `PLEX_ARGOCD_VERIFY_TLS`
- `CASE_ARGOCD_EMBED_URL`

## Cloudflare Tunnel (CASE Gateway)
Use `cloudflare-tunnel.sh` to expose the local gateway hostname `case.k8s.local` to the public internet via Cloudflare Tunnel.

Prerequisites:
- `cloudflared` installed (`brew install cloudflared` on macOS)
- local cluster/gateway running and resolving `case.k8s.local` to your local gateway IP
- a Cloudflare-managed DNS zone and a hostname you want to publish (for example `case.example.com`)

One-time setup:
```bash
export CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME=case.example.com
make -f ENDR/SCPT/Makefile tunnel-login
make -f ENDR/SCPT/Makefile tunnel-setup
```

Run/observe:
```bash
export CLOUDFLARE_TUNNEL_PUBLIC_HOSTNAME=case.example.com
make -f ENDR/SCPT/Makefile tunnel-start
make -f ENDR/SCPT/Makefile tunnel-status
make -f ENDR/SCPT/Makefile tunnel-logs
make -f ENDR/SCPT/Makefile tunnel-stop
```

Default tunnel origin (local side):
- `CLOUDFLARE_TUNNEL_ORIGIN_URL=https://case.k8s.local`
- `CLOUDFLARE_TUNNEL_ORIGIN_HOST_HEADER=case.k8s.local`
- `CLOUDFLARE_TUNNEL_ORIGIN_NO_TLS_VERIFY=true` (useful with local/self-signed gateway cert)

Optional overrides:
- `CLOUDFLARE_TUNNEL_NAME` (default `endr-case`)
- `CLOUDFLARED_CONFIG_DIR` (default `~/.cloudflared`)
