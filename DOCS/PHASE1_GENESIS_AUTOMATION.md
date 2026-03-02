# Phase 1 - TARS SVCS Check Automation (Single-PR GitOps Flow)

This phase implements the config-driven GitOps automation path without UI/API input forms.

## Goal

When `ENDR.yaml` or `SVCS.yaml` changes:
1. Read desired state from config.
2. Render expected service + GitOps files from templates.
3. Compare against repository files.
4. Write a Genesis-style state file.
5. Update generated files in the same Pull Request branch before merge.

## Script

- Path: `TARS/TARS.py` (subcommand: `svcs-check`)
- State output: `.idp/runtime/tars-svcs-state.yaml`

State file format (Genesis-style):

```yaml
projectName: genesis-platform
type: services-reconcile
state:
  hello-service: true
```

`true` means service files are already in sync with config/templates.
`false` means reconciliation changes are required.

## What `svcs-check` checks

For each service in `SVCS.yaml`, it renders expected outputs from:
- service template (`templates.service[*]` from `ENDR.yaml`)
- gitops template (`templates.gitops[*]` from `ENDR.yaml`)

Then it compares expected content with repo files:
- `SVCS/<name>/**`
- `KUBE/clusters/space/gargantua/<name>.yaml`

If file is missing or content differs, it is marked for reconcile and included in PR changes.

Service removal handling:
- If a service exists in repo-managed paths but is removed from `SVCS.yaml`, `TARS/TARS.py svcs-check` marks it as removed and stages file deletions.
- Deletions include:
  - `KUBE/clusters/space/gargantua/<service>.yaml`
  - `SVCS/<service>/**`
- The generated PR will remove these files so ArgoCD prunes the app in GitOps flow.

## GitHub Actions flow

Workflow: `.github/workflows/tars-init.yml`

Trigger:
- `pull_request` (opened/synchronize/reopened) when changed paths include:
  - `ENDR.yaml`
  - `SVCS.yaml`
- manual `workflow_dispatch`

Behavior:
- Detects changed service source paths in the PR and auto-updates `SVCS.yaml` image tags to immutable `git-<sha>` tags.
- Runs `TARS/TARS.py svcs-check --write-worktree`
- If drift exists, commits generated changes back to the same PR branch.
- PR merge is then a single source-of-truth merge (no second reconcile PR).
- Emits GitHub job annotations and job summary with added/updated/removed service details.

## Local test

Prerequisite: backend venv available at `ENDR/.venv`.

Validate config:

```bash
make -f SCPT/Makefile validate-config
```

Dry-run reconcile (no writes, no PR):

```bash
make -f SCPT/Makefile svcs-check
```

Write generated files to local worktree (still no PR):

```bash
make -f SCPT/Makefile svcs-sync
```

Open PR manually from local machine (optional):

```bash
GITHUB_TOKEN=<your_token> ENDR/.venv/bin/python TARS/TARS.py svcs-check --repo-root . --open-pr
```

## Portfolio framing

This phase demonstrates:
- Config-driven platform automation
- Template-based standardization (golden path)
- Drift detection + reconciliation
- GitOps-safe delivery through Pull Requests (no direct cluster writes)
