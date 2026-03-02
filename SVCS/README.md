# SVCS (Service Catalog)

`SVCS` contains deployable service folders generated from templates.

Each service typically includes:
- `app/`: application source code
- `Dockerfile`
- `requirements.txt` (for Python services)
- `chart/`: Helm chart used by ArgoCD for deployment

## Notes
- Service metadata source of truth is `SVCS.yaml`.
- Reconcile automation (`TARS/TARS.py genesis`) creates/updates/removes service assets here.
