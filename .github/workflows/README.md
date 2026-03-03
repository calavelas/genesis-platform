# Workflow Definitions

GitHub Actions workflow YAML files.

These workflows cover:
- TARS reconcile/generate on main
- TARS pull request reconcile and CASE auto-merge
- service image publishing
- ENDR image publishing

Files:
- `tars-build.yml`: runs only on `main` push when `ENDR.yaml` or `SVCS.yaml` changes; flow is split into `Reconcile -> Generate -> Push`.
- `tars-pr.yml`: runs on pull requests that touch `ENDR.yaml` or `SVCS.yaml`; performs reconcile checks and CASE auto-merge policy.
- `svcs-build.yml`: publishes changed service images from source updates on `main`, then persists generated tag updates back to repo.
- `endr-build.yml`: builds ENDR backend (`plex`) and frontend (`case`) images; PRs run build-only validation, while `main` builds/pushes to Docker Hub and persists chart image tags.

Toggle for branch cleanup:
- Repository variable `TARS_DELETE_SOURCE_BRANCH_ON_MERGE`
  - unset or any value except `false`: branch will be deleted
  - `false`: branch deletion is skipped
