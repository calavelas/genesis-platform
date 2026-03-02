# IDP Demo Documentation

## Documents
- `IDP_PYTHON_PHASE_PLAN.md`: phased implementation plan aligned to Genesis patterns.
- `PORTFOLIO_BUILD_GUIDE.md`: portfolio-focused narrative and demo checklist.
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
- `make smoke-test` to run automated API/config + platform smoke checks.
- `make smoke-test-api` to run API/config checks only.
- `make smoke-test-platform` to run bootstrap/platform checks only.

Prerequisites for `make bootstrap`:
- `k3d`
- `kubectl`
- `helm`
