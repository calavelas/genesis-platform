# Genesis Platform IDP Demo

Local-first GitOps Internal Developer Platform demo with:
- GitHub as source of truth
- ArgoCD app-of-apps deployment to local k3d
- config-driven reconciliation (`ENDR.yaml` + `SVCS.yaml`) via `TARS/TARS.py svcs-check`

## Repository Layout

### Root config files
- `ENDR.yaml`: platform/project metadata and template defaults.
- `SVCS.yaml`: service metadata catalog used by Phase 1 automation.

### Main folders
- `.github/`: GitHub Actions workflows for reconcile, validation, and image publishing.
- `CASE/`: frontend developer portal (Next.js).
- `DOCS/`: architecture, setup, phase plans, and portfolio docs.
- `ENDR/`: backend API runtime wrapper (FastAPI), delegating core logic to `TARS`.
- `KUBE/`: Kubernetes and GitOps infrastructure manifests (ArgoCD, policies, monitoring).
- `REFS/`: legacy/reference implementations used for migration guidance.
- `SCPT/`: bootstrap/dev/CI scripts and main `Makefile`.
- `SVCS/`: deployable application services (code + Helm chart per service).
- `TARS/`: shared Python automation engine (config loader, scaffold logic, reconcile CLI/API).

## Quick Start

### Documentation first
- [DOCS/README.md](DOCS/README.md)
- [DOCS/IDP_PYTHON_PHASE_PLAN.md](DOCS/IDP_PYTHON_PHASE_PLAN.md)
- [DOCS/PHASE1_GENESIS_AUTOMATION.md](DOCS/PHASE1_GENESIS_AUTOMATION.md)
- [DOCS/PORTFOLIO_BUILD_GUIDE.md](DOCS/PORTFOLIO_BUILD_GUIDE.md)

### Common commands
- `make -f SCPT/Makefile bootstrap`
- `make -f SCPT/Makefile validate-config`
- `make -f SCPT/Makefile svcs-check`
- `make -f SCPT/Makefile svcs-sync`
- `make -f SCPT/Makefile smoke-test`
- `make -f SCPT/Makefile api`
- `make -f SCPT/Makefile web`

### SVCS (Service) List

<!-- TARS:SVCS_TABLE_START -->
Total Services Running: 2

| Service Name | Template |
| --- | --- |
| brand | python-fastapi |
| miller | python-fastapi |
<!-- TARS:SVCS_TABLE_END -->
