# TARS (Automation Module)

`TARS` is the shared Python backend module for automation and generation.

It is used by:
- direct CLI entrypoint (`TARS/TARS.py`)
- API wrapper runtime (`ENDR/app/*`)

## Submodules
- `api/`: API-compatible handlers and models consumed by `ENDR`.
- `cli/`: command-line reconcile entrypoint (`svcs-check` behavior).
- `config/`: config schema + loaders for `ENDR.yaml` and `SVCS.yaml`.
- `scaffold/`: template rendering and GitHub PR orchestration logic.
- `templates/`: golden path templates for service and GitOps assets.
