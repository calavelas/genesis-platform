# SCPT (Scripts + Automation Entry)

`SCPT` contains local automation scripts and the main project `Makefile`.

## Key files
- `Makefile`: primary command interface (`bootstrap`, `svcs-check`, `api`, `web`, smoke tests).
- `bootstrap.sh`: creates local cluster, installs ArgoCD from in-repo chart, and applies GitOps root app.
- `dev-stack.sh`: starts/stops local backend + frontend + ArgoCD port-forward with PID/log management.
- `validate-config.sh`: validates `ENDR.yaml` and `SVCS.yaml`.
- `smoke-test.sh`: API/platform smoke test runner.
- `ci/`: CI helper scripts invoked by GitHub Actions.

## Common usage
```bash
make -f SCPT/Makefile bootstrap
make -f SCPT/Makefile validate-config
make -f SCPT/Makefile svcs-check
make -f SCPT/Makefile dev-start
make -f SCPT/Makefile dev-status
make -f SCPT/Makefile dev-stop
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
- ArgoCD exposed via port-forward on `https://127.0.0.1:18443`

```bash
bash SCPT/dev-stack.sh start
bash SCPT/dev-stack.sh status
bash SCPT/dev-stack.sh logs all
bash SCPT/dev-stack.sh stop
```

Environment overrides:
- `BACKEND_HOST`, `BACKEND_PORT`
- `FRONTEND_HOST`, `FRONTEND_PORT`
- `ENDR_API_URL`
- `ARGOCD_NAMESPACE`, `ARGOCD_LOCAL_PORT`, `ARGOCD_REMOTE_PORT`
- `ARGOCD_BASE_URL` (default `https://127.0.0.1:18443`)
- `PLEX_ARGOCD_SERVER`, `PLEX_ARGOCD_VERIFY_TLS`
- `CASE_ARGOCD_EMBED_URL`
