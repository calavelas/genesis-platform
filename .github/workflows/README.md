# Workflow Definitions

GitHub Actions workflow YAML files.

These workflows cover:
- reconcile automation PRs
- config/platform/service validation
- container image publishing
- post-merge TARS branch cleanup

Files:
- `tars-init.yml`: runs TARS SVCS reconcile on pull requests, auto-tags changed services (`git-<sha>`), commits generated files back to the same PR branch, and emits job annotations/summary.
- `svcs-publish.yml`: publishes changed service images.
- `tars-cleanup.yml`: deletes merged TARS source branches.
- `validate-platform.yml`: validates platform and templates.
- `validate-services.yml`: validates service/app changes.

Toggle for branch cleanup:
- Repository variable `TARS_DELETE_SOURCE_BRANCH_ON_MERGE`
  - unset or any value except `false`: branch will be deleted
  - `false`: branch deletion is skipped
