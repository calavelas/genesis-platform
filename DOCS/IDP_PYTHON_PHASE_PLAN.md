# IDP Demo (Python Backend) - Adjusted Instructions and Phased Plan

This plan adapts your original IDP idea to match the way Genesis was structured:
- config-driven
- template registry with named templates
- clear generator pipeline
- validate first, then generate, then raise PR

Current implementation status:
- Phase 1 (config-driven reconcile + PR automation) is now implemented via `TARS/TARS.py svcs-check` and `.github/workflows/tars-init.yml`.

Related:
- portfolio narrative: `DOCS/PORTFOLIO_BUILD_GUIDE.md`

## 1) Adjusted Build Instructions (Genesis-style, GitHub + ArgoCD)

### Core implementation style to keep
- Use **two primary config files**:
  - `ENDR.yaml` (global/project/platform config; like `genesis-config.yaml`)
  - `SVCS.yaml` (service entries + generator choices; like `service-config.yaml`)
- Use **named template catalogs** in `ENDR.yaml` (not hardcoded paths in code).
- Build a **Python generator runtime** under `.idp/`:
  - `.idp/runtime/` for generated values/state
  - `.idp/staging/` for rendered outputs before committing
- Add a **validation command** before PR creation:
  - template existence
  - duplicate service names
  - service name length limit (<= 48 chars)
  - template reference mismatch
- Use **branch + PR only** for all GitOps writes. Never commit to `main` from API/UI.

### Tech choices (fixed for V1)
- Backend: `FastAPI` (Python 3.12)
- Frontend: `Next.js + Tailwind`
- GitOps: `ArgoCD app-of-apps`
- K8s local: `k3d`
- Packaging for generated services: `Helm` (single approach, no Kustomize in V1)
- Policy: `Kyverno`
- Secrets model for V1: **Option A** (no secrets support yet; plain env vars only, documented clearly)

### Required repository structure
```text
/
  DOCS/
  SCPT/
  KUBE/
    argocd/
    clusters/
      mac/
        lab/
          core/
          platform/
          services/
      gcp/
        dev/
        prd/
    policies/
    monitoring/
  SVCS/
    examples/
  ENDR/
  CASE/
  TARS/templates/
    service/
    gitops/
  .github/workflows/
  ENDR.yaml
  SVCS.yaml
```

### Config contract to implement
- `ENDR.yaml` should include:
  - `projectName`
  - `owners`
  - `config.git` (GitHub org/repo/defaultBranch)
  - `config.cluster` (active cluster defaults used by generation)
  - `config.clusters` (cluster alias map for multi-cluster expansion)
  - `config.environments` (environment aliases, e.g. `local`, `gcp-dev`)
  - `templates.extends` (optional baseline config extension)
  - `templates.service[]` (name + path/url)
  - `templates.gitops[]` (name + path/url)
- `SVCS.yaml` should include:
  - `services[]`
  - each service has `name`, `namespace`, `deployTo` (one or more environments)
  - `generator.service.template`
  - `generator.gitops.template`
  - optional overrides for image, port, resources, ingress, env

## 2) Phased Build Plan

### Phase 0 - Foundation and Contract
Goal: lock structure and config schemas before coding generators.

Deliverables:
- repo skeleton exactly as required
- `ENDR.yaml` and `SVCS.yaml` examples
- Pydantic config models in `ENDR`
- docs page for config fields and examples

Exit criteria:
- config files parse successfully
- schema validation errors are human-readable

### Phase 1 - Local Platform Bootstrap (k3d + ArgoCD root app)
Goal: one-command cluster bootstrap and app-of-apps wiring.

Deliverables:
- `SCPT/bootstrap.sh`
- `SCPT/Makefile` targets: `bootstrap`, `down`, `port-forward`
- ArgoCD install and root app bootstrap:
  - `KUBE/clusters/mac/lab/core.yaml`
  - `KUBE/clusters/mac/lab/core/*`
- ingress controller install and documented URLs

Exit criteria:
- `make -f SCPT/Makefile bootstrap` creates cluster and ArgoCD
- root app is Healthy/Synced

### Phase 2 - Template Engine + Scaffolder (Python)
Goal: Genesis-like generation flow in Python, no UI yet.

Deliverables:
- generator module in `ENDR`:
  - read global + service config
  - validate config/template references
  - render service code template (`TARS/templates/service`)
  - render Helm + Argo app template (`TARS/templates/gitops`)
  - write outputs into `.idp/staging/`
- sample generated service under `SVCS/examples/`

Exit criteria:
- CLI/script can generate one service end-to-end from config
- outputs are deterministic (same input -> same files)

### Phase 3 - GitHub PR Automation (Backend-first)
Goal: branch creation and PR flow from Python backend.

Deliverables:
- GitHub integration service in FastAPI:
  - create feature branch
  - commit generated files
  - open PR to `main`
  - return PR URL and changed files
- endpoint: `POST /api/services`
- strict rule: reject direct-main writes

Exit criteria:
- creating service from API opens a working PR
- no direct commit to default branch

### Phase 4 - Deployment Status API
Goal: backend can report GitOps and workload status.

Deliverables:
- endpoints:
  - `GET /api/health`
  - `GET /api/services`
  - `GET /api/services/{name}`
- integrations:
  - ArgoCD app sync/health status
  - Kubernetes pods ready count
  - latest PR link/status from GitHub
- read-only Kubernetes ServiceAccount + RBAC manifests

Exit criteria:
- API returns accurate status for generated services
- backend has read-only cluster permissions

### Phase 5 - Web UI (Next.js)
Goal: complete V1 user workflow via browser.

Deliverables:
- pages:
  - Login (GitHub OAuth)
  - Services list
  - Service detail
  - Create service form
- form posts to FastAPI `POST /api/services`
- dashboard shows Argo sync/health + pods ready + PR links

Exit criteria:
- user can login, create service, and track deployment from UI

### Phase 6 - Policy as Code + CI Validation
Goal: enforce platform rules in cluster and PR.

Deliverables:
- Kyverno install manifests
- policies:
  - block `:latest` tag
  - require requests/limits
  - block privileged containers
- GitHub Actions:
  - path-scoped checks
  - YAML lint + Helm lint + kubeconform
  - policy validation

Exit criteria:
- policy violations fail PR checks
- invalid manifests fail CI

### Phase 7 - Monitoring + Docs + Demo Script
Goal: complete demo readiness.

Deliverables:
- monitoring install (`kube-prometheus-stack` preferred)
- UI links for ArgoCD and Grafana
- docs:
  - `DOCS/README.md` architecture + happy path
  - `DOCS/SETUP_GITHUB_OAUTH.md`
  - troubleshooting section

Exit criteria:
- fresh machine can run full demo from docs
- recorded happy path works end-to-end

## 3) Recommended execution order inside each phase

For each phase, keep this sequence:
1. Define config/schema changes.
2. Add validation.
3. Implement generation/deployment logic.
4. Add tests.
5. Document usage.

This preserves your Genesis workflow discipline and keeps regressions low.
