# IDP Demo Documentation

## Documents
- `IDP_PYTHON_PHASE_PLAN.md`: phased implementation plan aligned to Genesis patterns.
- `PORTFOLIO_BUILD_GUIDE.md`: portfolio-focused narrative and demo checklist.
- `PHASE1_GENESIS_AUTOMATION.md`: Phase 1 config-driven reconcile automation and PR flow.
- `SETUP_GITHUB_OAUTH.md`: GitHub OAuth setup steps for local development.

## Initial Architecture
- Source of truth: GitHub monorepo
- Deployment: ArgoCD app-of-apps to local k3d
- Core Python module: `TARS/` (config, scaffold, genesis reconcile CLI, API handlers)
- Backend runtime entrypoint: FastAPI (`ENDR`, thin wrapper to `TARS`)
- Frontend: Next.js (`CASE`)
- Templates: service + GitOps (`TARS/templates/`)
- Platform: ArgoCD, policies, monitoring (`KUBE/`)

## Quickstart Commands
- `make -f SCPT/Makefile bootstrap` to create local platform dependencies in k3d.
- `make -f SCPT/Makefile port-forward` to open ArgoCD and Grafana local access.
- `make -f SCPT/Makefile api` to run FastAPI backend.
- `make -f SCPT/Makefile web` to run Next.js frontend.
- `make -f SCPT/Makefile validate-config` to validate `ENDR.yaml` and `SVCS.yaml`.
- `make -f SCPT/Makefile svcs-check` to run Phase 1 reconcile check (dry-run, no PR).
- `make -f SCPT/Makefile svcs-sync` to render reconcile changes into working tree.
- `make -f SCPT/Makefile smoke-test` to run automated API/config + platform smoke checks.
- `make -f SCPT/Makefile smoke-test-api` to run API/config checks only.
- `make -f SCPT/Makefile smoke-test-platform` to run bootstrap/platform checks only.

## Service Scaffolding API
- `POST /api/services` supports:
  - `dryRun: true` -> render into `.idp/staging/<service>` and return generated file list.
  - `dryRun: false` -> render + create branch + commit files + open GitHub PR.

## CI/CD Notes
- Workflow `tars-init.yml` runs on PR changes to `ENDR.yaml`/`SVCS.yaml`, executes `TARS/TARS.py svcs-check --write-worktree`, and auto-commits generated assets back to the same PR branch.
- `tars-init.yml` publishes job annotations (`::notice::`) and a Markdown job summary with changed service/file details.
- ArgoCD child app template now sets `syncOptions: [CreateNamespace=true]`.
- Workflow `tars-cleanup.yml` deletes merged TARS-generated source branches.
- On merge to `main`, workflow `svcs-publish.yml` detects changed services, builds images from `SVCS/<name>/Dockerfile`, and pushes tags from each `SVCS/<name>/chart/values.yaml` to Docker Hub.
- The same workflow also supports manual `workflow_dispatch` to publish all services in one run.

Optional branch cleanup toggle:
- Set repo variable `TARS_DELETE_SOURCE_BRANCH_ON_MERGE=false` to keep merged TARS branches.

Required repo secrets for Docker Hub publish:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_PASSWORD`

Image repository format for publish:
- `SVCS/<name>/chart/values.yaml` -> `image.repository` should be Docker Hub style (`docker.io/<user>/<repo>` or `<user>/<repo>`).

Prerequisites for `make -f SCPT/Makefile bootstrap`:
- `k3d`
- `kubectl`
- `helm`
