# How We Built the GitOps IDP Demo (Portfolio Guide)

Use this document as your portfolio reference for the project story, technical decisions, and delivery approach.

## 1) Project Summary

Project: Local-first Internal Developer Platform (IDP) demo using GitOps.

Problem:
- Developers need a safe self-service flow to create services without direct cluster access.
- Platform teams need standard templates, policy guardrails, and visible deployment status.

Solution:
- Web UI + Python API scaffold services and GitOps config from templates.
- All platform changes go through GitHub Pull Requests.
- ArgoCD syncs merged changes to a local Kubernetes cluster (k3d).

## 2) Why This Design

We followed Genesis-style principles from your reference implementation:
- config-driven workflow (`idp-config.yaml`, `services-config.yaml`)
- named template catalogs (golden path by template name)
- validate before generation
- stage outputs before git operations
- Git as source of truth, not direct `kubectl apply` from UI

Key design decisions:
- Backend in Python (`FastAPI`) for extensibility and API-first development.
- Helm as the single deployment templating model in V1.
- ArgoCD app-of-apps for scalable GitOps structure.
- Kyverno policies for baseline platform safety.
- Local-first bootstrap for fast demos and repeatable onboarding.

## 3) Architecture Snapshot

Main components:
- `apps/idp-web`: developer-facing UI (create/list/detail pages)
- `apps/idp-api`: FastAPI orchestration (scaffold, PR, status)
- `templates/service`: service code skeleton
- `templates/gitops`: Helm + Argo Application templates
- `platform/*`: ArgoCD root app, per-service app defs, policies, monitoring
- `.github/workflows/*`: PR validation and policy checks

Control flow:
1. User submits "Create Service" in UI.
2. API validates config + template references.
3. API renders service + GitOps files to staging.
4. API creates branch, commits generated files, opens PR.
5. After PR merge, ArgoCD auto-sync deploys to k3d.
6. UI shows Argo health/sync + pod readiness + PR status.

## 4) Build Phases and Outputs

### Phase 0 - Foundation
Output:
- repo skeleton
- config schemas
- docs baseline

### Phase 1 - Platform Bootstrap
Output:
- `scripts/bootstrap.sh`
- `Makefile` (`bootstrap`, `up`, `down`, `port-forward`)
- ArgoCD installation and root app bootstrap

### Phase 2 - Scaffolding Engine
Output:
- Python generator service
- config validation
- deterministic rendering from templates

### Phase 3 - GitHub PR Automation
Output:
- branch + commit + PR flow in FastAPI
- strict no-direct-main rule

### Phase 4 - Status API
Output:
- service list/detail health endpoints
- ArgoCD + Kubernetes status aggregation

### Phase 5 - Frontend UX
Output:
- login, services list, service detail, create service page

### Phase 6 - Policy + CI
Output:
- Kyverno policy set
- GitHub Actions checks (YAML, Helm, kubeconform, policy)

### Phase 7 - Observability + Demo Docs
Output:
- Prometheus/Grafana stack
- demo walkthrough and troubleshooting docs

## 5) Engineering Standards Applied

- All changes through Pull Requests.
- Generated manifests include readiness/liveness and resources by default.
- Policy checks enforced in both cluster and CI.
- Minimal RBAC: backend uses read-only ServiceAccount for status reads.
- Path-scoped CI to keep feedback fast.

## 6) Demo Script (Portfolio Recording Friendly)

Use this order when recording:
1. Run bootstrap and show platform URLs.
2. Open UI and login.
3. Create a new service (name/image/port/resources/ingress).
4. Show generated PR in GitHub.
5. Merge PR.
6. Show ArgoCD sync and app health.
7. Show pods ready and service URL response.
8. Show policy failure example (e.g., `latest` tag blocked).

## 7) Evidence Checklist (Keep for Portfolio Assets)

- architecture diagram screenshot
- Create Service form screenshot
- generated PR screenshot (changed files visible)
- ArgoCD synced app screenshot
- Grafana dashboard screenshot
- CI policy failure screenshot
- short terminal clip of `make bootstrap`

## 8) Challenges and Tradeoffs to Mention

- Tradeoff: local-first scope keeps onboarding easy, but omits multi-cluster complexity.
- Tradeoff: secrets deferred in V1 (plain env vars only) to keep the demo focused.
- Challenge: keeping template flexibility while preserving guardrails.
- Challenge: status aggregation across GitHub + ArgoCD + Kubernetes APIs.

## 9) Portfolio Bullet Examples

- Built a local GitOps IDP demo on k3d with ArgoCD app-of-apps and GitHub as single source of truth.
- Implemented a FastAPI orchestration backend that scaffolds service and Helm GitOps assets, then opens PRs automatically.
- Enforced platform guardrails using Kyverno and CI checks (YAML lint, Helm lint, kubeconform, policy validation).
- Delivered a Next.js self-service portal showing deployment sync/health and pod readiness without exposing cluster-admin access.

## 10) Next Portfolio Upgrade Ideas

- Add SOPS + age secrets flow and show encrypted values in Git.
- Add multi-environment promotion workflow (dev -> staging -> prod).
- Add DORA-style deployment metrics panel.

