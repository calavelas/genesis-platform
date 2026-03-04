# BSTG (Backstage Alternative Track)

`BSTG` is a separate implementation track for running the ENDR service-creation story through Backstage.

This folder is intentionally isolated from `CASE` and `PLEX`.

## Goal

Provide a Backstage software template flow that:

- collects service inputs (`serviceName`, `serviceTemplate`, `gitopsTemplate`, `namespace`, `environment`, `gatewayEnabled`)
- calls TARS API to open a PR that appends `SVCS.yaml`
- reuses existing GitHub workflow chain (`tars-pr` -> auto-merge policy -> `tars-build` -> `svcs-build`)

## Runtime Contract

`BSTG` depends on existing PLEX API endpoints:

- `GET /api/plex/templates`
- `POST /api/plex/services`

This keeps Backstage integration separate from `CASE` UI while reusing backend APIs.

## Folder Layout

- `catalog-info.yaml`: Backstage location entry for templates.
- `templates/create-service/template.yaml`: software template for ENDR service registration.
- `app/plugins/scaffolder-module-endr/`: custom Backstage scaffolder actions for ENDR.

## Integration Summary

1. Install/build `plugins/scaffolder-module-endr` in your Backstage backend workspace.
2. Register actions in `scaffolder` backend plugin:
   - `endr:load-options`
   - `endr:create-service`
3. Register template location from this folder (`catalog-info.yaml`).

See plugin details in:

- `app/plugins/scaffolder-module-endr/README.md`
