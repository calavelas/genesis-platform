# CASE (Developer Portal)

`CASE` is the frontend developer portal (Next.js) for:
- viewing service/deployment status
- submitting service creation requests (Phase 2)
- linking users to ArgoCD and observability views
- visualizing app-of-apps topology via `GET /api/plex/universe`

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
