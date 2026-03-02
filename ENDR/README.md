# ENDR (FastAPI)

`ENDR` is the backend API runtime.

It acts as a thin wrapper over shared logic in `TARS/`, and provides:
- config validation for `ENDR.yaml` and `SVCS.yaml`
- service/GitOps scaffolding and reconcile API flows
- GitHub branch/commit/PR integration
- health and configuration endpoints for local UI

Run locally:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Validate config files:
```bash
python3 -m app.config.loader
```

Current endpoints:
- `GET /api/health`
- `GET /api/config/validate`
- `GET /api/config`
- `POST /api/services` (supports `dryRun`)

Required env for PR creation (`dryRun=false`):
- `GITHUB_TOKEN`
