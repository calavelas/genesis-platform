# CASE (Developer Portal)

`CASE` is the frontend developer portal (Next.js) for:
- viewing service/deployment status
- submitting service creation requests (Phase 2)
- linking users to ArgoCD and observability views
- visualizing app-of-apps topology via `GET /api/plex/universe`
- providing a read-only ArgoCD wrapper UI without user login

## Folder Structure
- `src/app/`: route pages and UI composition.
- `package.json`: frontend dependencies and scripts.

## Run Locally
```bash
cd CASE
npm install
npm run dev
```

Default URL: `http://localhost:3000`

Optional API base override:
```bash
ENDR_API_URL=http://localhost:8000 npm run dev
```

Optional ArgoCD embed override:
```bash
CASE_ARGOCD_EMBED_URL=https://127.0.0.1:18443/applications npm run dev
```

## ArgoCD Read-Only Mode (No UI Login)
CASE reads ArgoCD data from the ENDR backend endpoint `GET /api/plex/universe`.
The ArgoCD token is only used on the backend (`PLEX`) and is never exposed to the browser.

1. Start backend with ArgoCD env:
```bash
export PLEX_ARGOCD_SERVER="https://argocd.k8s.local"
export PLEX_ARGOCD_VERIFY_TLS="true"
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir ENDR
```

2. Start CASE against backend:
```bash
cd CASE
ENDR_API_URL=http://127.0.0.1:8000 npm run dev
```
