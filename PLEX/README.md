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

## ArgoCD Integration
`build_plex_universe()` supports two data modes:
- `argocd`: pulls live app status from ArgoCD API.
- `config`: fallback snapshot derived from `ENDR.yaml` and `SVCS.yaml`.

Environment variables:
- `PLEX_ARGOCD_SERVER`: ArgoCD base URL, defaults to `https://argocd.k8s.local`
- `PLEX_ARGOCD_TOKEN`: optional ArgoCD API token (not required if anonymous read-only is enabled)
- `PLEX_ARGOCD_VERIFY_TLS`: `true` (default) or `false` for self-signed/local TLS

Security model:
- CASE frontend only calls `/api/plex/universe`.
- ArgoCD credentials stay backend-only and are never sent to the browser.
