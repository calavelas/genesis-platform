# Phase 1 - Genesis Reconcile Automation (Config -> Generated PR)

This phase implements the config-driven GitOps automation path without UI/API input forms.

## Goal

When `ENDR.yaml` or `SVCS.yaml` changes:
1. Read desired state from config.
2. Render expected service + GitOps files from templates.
3. Compare against repository files.
4. Write a Genesis-style state file.
5. Open a Pull Request with only the generated drift fixes.

## Script

- Path: `TARS/TARS.py` (subcommand: `genesis`)
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

## What `genesis` reconcile checks

For each service in `SVCS.yaml`, it renders expected outputs from:
- service template (`templates.service[*]` from `ENDR.yaml`)
- gitops template (`templates.gitops[*]` from `ENDR.yaml`)

Then it compares expected content with repo files:
- `SVCS/<name>/**`
- `KUBE/clusters/local/apps/<name>.yaml`

If file is missing or content differs, it is marked for reconcile and included in PR changes.

Service removal handling:
- If a service exists in repo-managed paths but is removed from `SVCS.yaml`, `TARS/TARS.py genesis` marks it as removed and stages file deletions.
- Deletions include:
  - `KUBE/clusters/local/apps/<service>.yaml`
  - `SVCS/<service>/**`
- The generated PR will remove these files so ArgoCD prunes the app in GitOps flow.

## GitHub Actions flow

Workflow: `.github/workflows/genesis-reconcile.yml`

Trigger:
- `push` to `main` when changed paths include:
  - `ENDR.yaml`
  - `SVCS.yaml`
- manual `workflow_dispatch`

Behavior:
- Runs `TARS/TARS.py genesis --open-pr`
- If drift exists, creates branch + PR automatically.
- If no drift exists, exits cleanly with no PR.

## Local test

Prerequisite: backend venv available at `ENDR/.venv`.

Validate config:

```bash
make -f SCPT/Makefile validate-config
```

Dry-run reconcile (no writes, no PR):

```bash
make -f SCPT/Makefile genesis
```

Write generated files to local worktree (still no PR):

```bash
make -f SCPT/Makefile genesis-write
```

Open PR manually from local machine (optional):

```bash
GITHUB_TOKEN=<your_token> ENDR/.venv/bin/python TARS/TARS.py genesis --repo-root . --open-pr
```

## Portfolio framing

This phase demonstrates:
- Config-driven platform automation
- Template-based standardization (golden path)
- Drift detection + reconciliation
- GitOps-safe delivery through Pull Requests (no direct cluster writes)
