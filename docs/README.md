# IDP Demo Documentation

## Documents
- `IDP_PYTHON_PHASE_PLAN.md`: phased implementation plan aligned to Genesis patterns.
- `PORTFOLIO_BUILD_GUIDE.md`: portfolio-focused narrative and demo checklist.
- `PHASE1_GENESIS_AUTOMATION.md`: Phase 1 config-driven reconcile automation and PR flow.
- `SETUP_GITHUB_OAUTH.md`: GitHub OAuth setup steps for local development.

## Initial Architecture
- Source of truth: GitHub monorepo
- Deployment: ArgoCD app-of-apps to local k3d
- Backend: FastAPI (`apps/idp-api`)
- Frontend: Next.js (`apps/idp-web`)
- Templates: service + GitOps (`templates/`)
- Platform: ArgoCD, policies, monitoring (`platform/`)

## Quickstart Commands
- `make bootstrap` to create local platform dependencies in k3d.
- `make port-forward` to open ArgoCD and Grafana local access.
- `make api` to run FastAPI backend.
- `make web` to run Next.js frontend.
- `make validate-config` to validate `idp-config.yaml` and `services-config.yaml`.
- `make genesis` to run Phase 1 reconcile check (dry-run, no PR).
- `make genesis-write` to render reconcile changes into working tree.
- `make smoke-test` to run automated API/config + platform smoke checks.
- `make smoke-test-api` to run API/config checks only.
- `make smoke-test-platform` to run bootstrap/platform checks only.

## Service Scaffolding API
- `POST /api/services` supports:
  - `dryRun: true` -> render into `.idp/staging/<service>` and return generated file list.
  - `dryRun: false` -> render + create branch + commit files + open GitHub PR.

## CI/CD Notes
- Workflow `genesis-reconcile.yml` runs on config-file changes and opens a reconcile PR using `scripts/ci/genesis.py`.
- ArgoCD child app template now sets `syncOptions: [CreateNamespace=true]`.
- On merge to `main`, workflow `publish-service-images.yml` detects changed services, builds images from `services/<name>/Dockerfile`, and pushes tags from each `services/<name>/chart/values.yaml` to GHCR.
- The same workflow also supports manual `workflow_dispatch` to publish all services in one run.

Prerequisites for `make bootstrap`:
- `k3d`
- `kubectl`
- `helm`
