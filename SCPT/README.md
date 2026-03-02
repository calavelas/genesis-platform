# SCPT (Scripts + Automation Entry)

`SCPT` contains local automation scripts and the main project `Makefile`.

## Key files
- `Makefile`: primary command interface (`bootstrap`, `svcs-check`, `api`, `web`, smoke tests).
- `bootstrap.sh`: installs local platform dependencies and ArgoCD bootstrap.
- `validate-config.sh`: validates `ENDR.yaml` and `SVCS.yaml`.
- `smoke-test.sh`: API/platform smoke test runner.
- `ci/`: CI helper scripts invoked by GitHub Actions.

## Common usage
```bash
make -f SCPT/Makefile bootstrap
make -f SCPT/Makefile validate-config
make -f SCPT/Makefile svcs-check
```
