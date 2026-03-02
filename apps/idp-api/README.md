# idp-api (FastAPI)

This service will:
- validate configs and template selections
- scaffold service and GitOps assets
- create branch + commit + PR in GitHub
- expose deployment status endpoints

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
