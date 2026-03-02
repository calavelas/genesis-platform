# PLEX (Portal Domain Logic)

`PLEX` contains portal-focused domain logic that is intentionally separate from `TARS`.

Current responsibility:
- build the ArgoCD "universe" model used by CASE (`/api/plex/universe`)
- own the PLEX API router for portal endpoints

Primary module:
- `universe.py`: data models and ArgoCD/config aggregation logic
- `router.py`: FastAPI route(s) for PLEX functionality

Notes:
- runtime configuration and service catalog are loaded from shared config modules in `TARS.config`.
- `TARS/api/main.py` includes the PLEX router into the shared backend app.
