# ENDR (FastAPI)

`ENDR` is the platform umbrella folder.

It contains:
- `PLEX/`: portal domain module for ArgoCD-backed data.
- `TARS/`: automation engine/CLI and templates.
- `SCPT/`: platform bootstrap/dev scripts.
- `CASE/`: frontend portal UI.

It acts as a thin wrapper over shared logic in `ENDR/TARS/`, and provides:
- config validation for `ENDR.yaml` and `SVCS.yaml`
- service/GitOps scaffolding and reconcile API flows
- GitHub branch/commit/PR integration
- health and configuration endpoints for local UI

Run locally:
```bash
cd ENDR
uvicorn TARS.api.main:app --reload --host 0.0.0.0 --port 8000
```

Run from repo root:
```bash
python -m uvicorn TARS.api.main:app --reload --host 0.0.0.0 --port 8000 --app-dir ENDR
```

Validate config files:
```bash
python3 -m TARS.config.loader
```

Current endpoints:
- `GET /api/health`
- `GET /api/config/validate`
- `GET /api/config`
- `GET /api/plex/universe` (powered by `PLEX` domain module)
- `POST /api/services` (supports `dryRun`)

Optional env for live ArgoCD-backed portal data:
- `PLEX_ARGOCD_SERVER` (defaults to `https://argocd.k8s.local`)
- `PLEX_ARGOCD_TOKEN` (optional when ArgoCD anonymous read-only is enabled)
- `PLEX_ARGOCD_VERIFY_TLS` (`true` by default)

Required env for PR creation (`dryRun=false`):
- `GITHUB_TOKEN`
