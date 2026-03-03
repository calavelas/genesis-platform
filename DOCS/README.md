# IDP Demo Documentation

## Documents
- `IDP_PYTHON_PHASE_PLAN.md`: phased implementation plan aligned to Genesis patterns.
- `PORTFOLIO_BUILD_GUIDE.md`: portfolio-focused narrative and demo checklist.
- `PHASE1_GENESIS_AUTOMATION.md`: Phase 1 config-driven reconcile automation and PR flow.
- `SETUP_GITHUB_OAUTH.md`: GitHub OAuth setup steps for local development.

## Initial Architecture
- Source of truth: GitHub monorepo
- Deployment: ArgoCD app-of-apps to local k3d
- Core Python module: `ENDR/TARS/` (config, scaffold, genesis reconcile CLI, API handlers)
- Backend runtime entrypoint: FastAPI (`ENDR`, thin wrapper to `TARS`)
- Frontend: Next.js (`CASE`)
- Templates: service + GitOps (`ENDR/TARS/templates/`)
- Platform: ArgoCD, policies, monitoring (`KUBE/`)

## Quickstart Commands
- `make -f ENDR/SCPT/Makefile bootstrap` to create local platform dependencies in k3d.
- `make -f ENDR/SCPT/Makefile port-forward` to open ArgoCD and Grafana local access.
- `make -f ENDR/SCPT/Makefile api` to run FastAPI backend.
- `make -f ENDR/SCPT/Makefile web` to run Next.js frontend.
- `make -f ENDR/SCPT/Makefile validate-config` to validate `ENDR.yaml` and `SVCS.yaml`.
- `make -f ENDR/SCPT/Makefile svcs-check` to run Phase 1 reconcile check (dry-run, no PR).
- `make -f ENDR/SCPT/Makefile svcs-sync` to render reconcile changes into working tree.
- `make -f ENDR/SCPT/Makefile smoke-test` to run automated API/config + platform smoke checks.
- `make -f ENDR/SCPT/Makefile smoke-test-api` to run API/config checks only.
- `make -f ENDR/SCPT/Makefile smoke-test-platform` to run bootstrap/platform checks only.

## Service Scaffolding API
- `POST /api/services` supports:
  - `dryRun: true` -> render into `.idp/staging/<service>` and return generated file list.
  - `dryRun: false` -> render + create branch + commit files + open GitHub PR.

## CI/CD Notes
- Workflow `tars-init.yml` runs on PR changes to `ENDR.yaml`/`SVCS.yaml`, auto-tags changed service images (`git-<sha>`), executes `ENDR/TARS/TARS.py svcs-check --write-worktree`, and auto-commits generated assets back to the same PR branch.
- `tars-init.yml` publishes job annotations (`::notice::`) and a Markdown job summary with changed service/file details.
- ArgoCD child app template now sets `syncOptions: [CreateNamespace=true]`.
- Workflow `tars-cleanup.yml` deletes merged TARS-generated source branches.
- On merge to `main`, workflow `svcs-build.yml` detects changed source services, auto-sets `git-<sha>` image tags, builds images from `SVCS/<name>/Dockerfile`, pushes to Docker Hub, and persists updated tags back to repo.
- Workflow `svcs-build.yml` also supports manual `workflow_dispatch` to publish all services in one run.
- Workflow `svcs-tagged.yml` runs on Git tags in format `servicename.Vx.x.x`, builds image from `SVCS/servicename`, and publishes Docker tag `Vx.x.x`.
- On PR/main changes for ENDR frontend/backend paths, workflow `platform-build.yml` builds `endr-api` + `endr-case`; PRs validate build only, and `main` pushes images then updates `ENDR/PLEX/chart/values.yaml` and `ENDR/CASE/chart/values.yaml` with the new `git-<sha>` tag.

Optional branch cleanup toggle:
- Set repo variable `TARS_DELETE_SOURCE_BRANCH_ON_MERGE=false` to keep merged TARS branches.

Required repo secrets for Docker Hub publish:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_PASSWORD`

Image repository format for publish:
- `SVCS/<name>/chart/values.yaml` -> `image.repository` should be Docker Hub style (`docker.io/<user>/<repo>` or `<user>/<repo>`).

Prerequisites for `make -f ENDR/SCPT/Makefile bootstrap`:
- `k3d`
- `kubectl`
- `helm`
