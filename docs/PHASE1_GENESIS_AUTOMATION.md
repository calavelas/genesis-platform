# Phase 1 - Genesis Reconcile Automation (Config -> Generated PR)

This phase implements the config-driven GitOps automation path without UI/API input forms.

## Goal

When `idp-config.yaml` or `services-config.yaml` changes:
1. Read desired state from config.
2. Render expected service + GitOps files from templates.
3. Compare against repository files.
4. Write a Genesis-style state file.
5. Open a Pull Request with only the generated drift fixes.

## Script

- Path: `scripts/ci/genesis.py`
- State output: `.idp/runtime/genesis-services-state.yaml`

State file format (Genesis-style):

```yaml
projectName: genesis-platform
type: services-reconcile
state:
  hello-service: true
```

`true` means service files are already in sync with config/templates.
`false` means reconciliation changes are required.

## What `genesis.py` checks

For each service in `services-config.yaml`, it renders expected outputs from:
- service template (`templates.service[*]` from `idp-config.yaml`)
- gitops template (`templates.gitops[*]` from `idp-config.yaml`)

Then it compares expected content with repo files:
- `services/<name>/**`
- `platform/clusters/local/apps/<name>.yaml`

If file is missing or content differs, it is marked for reconcile and included in PR changes.

## GitHub Actions flow

Workflow: `.github/workflows/genesis-reconcile.yml`

Trigger:
- `push` to `main` when changed paths include:
  - `idp-config.yaml`
  - `services-config.yaml`
- manual `workflow_dispatch`

Behavior:
- Runs `scripts/ci/genesis.py --open-pr`
- If drift exists, creates branch + PR automatically.
- If no drift exists, exits cleanly with no PR.

## Local test

Prerequisite: backend venv available at `apps/idp-api/.venv`.

Validate config:

```bash
make validate-config
```

Dry-run reconcile (no writes, no PR):

```bash
make genesis
```

Write generated files to local worktree (still no PR):

```bash
make genesis-write
```

Open PR manually from local machine (optional):

```bash
GITHUB_TOKEN=<your_token> apps/idp-api/.venv/bin/python scripts/ci/genesis.py --repo-root . --open-pr
```

## Portfolio framing

This phase demonstrates:
- Config-driven platform automation
- Template-based standardization (golden path)
- Drift detection + reconciliation
- GitOps-safe delivery through Pull Requests (no direct cluster writes)
