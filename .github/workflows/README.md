# Workflow Definitions

GitHub Actions workflow YAML files.

These workflows cover:
- reconcile automation PRs
- config/platform/service validation
- container image publishing
- post-merge TARS branch cleanup

Files:
- `tars-init.yml`: runs TARS SVCS reconcile on pull requests, auto-tags changed services (`git-<sha>`), commits generated files back to the same PR branch, and emits job annotations/summary.
- `svcs-build.yml`: publishes changed service images from source updates on `main`, then persists generated tag updates back to repo.
- `platform-build.yml`: builds ENDR backend (`plex`) and frontend (`case`) images; PRs run build-only validation, while `main` builds/pushes to Docker Hub and persists chart image tags.
- `svcs-tagged.yml`: builds and publishes a single service image when a Git tag matches `servicename.Vx.x.x`.
- `tars-cleanup.yml`: deletes merged TARS source branches.
- `validate-platform.yml`: validates platform and templates.
- `validate-services.yml`: validates service/app changes.

Toggle for branch cleanup:
- Repository variable `TARS_DELETE_SOURCE_BRANCH_ON_MERGE`
  - unset or any value except `false`: branch will be deleted
  - `false`: branch deletion is skipped
