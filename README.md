# Genesis Platform IDP Demo

Local-first GitOps Internal Developer Platform demo with:
- GitHub as source of truth
- ArgoCD app-of-apps deployment to local k3d
- config-driven reconciliation (`ENDR.yaml` + `SVCS.yaml`) via `ENDR/TARS/TARS.py svcs-check`

## Repository Layout

### Root config files
- `ENDR.yaml`: platform/project metadata and template defaults.
- `SVCS.yaml`: service metadata catalog used by Phase 1 automation.

### Main folders
- `.github/`: GitHub Actions workflows for reconcile, validation, and image publishing.
- `ENDR/`: platform umbrella (backend runtime plus CASE, PLEX, SCPT, TARS).
- `ENDR/CASE/`: frontend developer portal (Next.js).
- `DOCS/`: architecture, setup, phase plans, and portfolio docs.
- `ENDR/PLEX/`: backend portal domain module (ArgoCD universe/API router).
- `KUBE/`: Kubernetes and GitOps infrastructure manifests (ArgoCD, policies, monitoring).
- `REFS/`: legacy/reference implementations used for migration guidance.
- `ENDR/SCPT/`: bootstrap/dev/CI scripts and main `Makefile`.
- `SVCS/`: deployable application services (code + Helm chart per service).
- `ENDR/TARS/`: shared Python automation engine (config loader, scaffold logic, reconcile CLI/API).

## Quick Start

### Documentation first
- [DOCS/README.md](DOCS/README.md)
- [DOCS/IDP_PYTHON_PHASE_PLAN.md](DOCS/IDP_PYTHON_PHASE_PLAN.md)
- [DOCS/PHASE1_GENESIS_AUTOMATION.md](DOCS/PHASE1_GENESIS_AUTOMATION.md)
- [DOCS/PORTFOLIO_BUILD_GUIDE.md](DOCS/PORTFOLIO_BUILD_GUIDE.md)

### Common commands
- `make -f ENDR/SCPT/Makefile bootstrap`
- `make -f ENDR/SCPT/Makefile validate-config`
- `make -f ENDR/SCPT/Makefile svcs-check`
- `make -f ENDR/SCPT/Makefile svcs-sync`
- `make -f ENDR/SCPT/Makefile smoke-test`
- `make -f ENDR/SCPT/Makefile api`
- `make -f ENDR/SCPT/Makefile web`

### SVCS (Service) List

<!-- TARS:SVCS_TABLE_START -->
Total Services Running: 6

| Service Name | Template |
| --- | --- |
| case-e2e-build-dispatch-test | python-fastapi |
| case-e2e-build-dispatch-verify | python-fastapi |
| case-e2e-cleanup-test | python-fastapi |
| case-e2e-merge-test | python-fastapi |
| cooper | python-fastapi |
| sample | python-fastapi |
<!-- TARS:SVCS_TABLE_END -->
