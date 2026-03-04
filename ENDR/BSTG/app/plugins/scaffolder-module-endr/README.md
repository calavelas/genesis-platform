# scaffolder-module-endr

Custom Backstage scaffolder actions for ENDR service registration.

## Actions

- `endr:load-options`
  - Calls `GET /api/plex/templates`
  - Outputs available templates/namespaces/environments as comma-separated text

- `endr:create-service`
  - Calls `POST /api/plex/services`
  - Opens PR (`CASE - Adding service : <name>`)
  - Outputs PR URL/number/branch and service URLs

## Local Build

```bash
cd ENDR/BSTG/app
node .yarn/releases/yarn-4.4.1.cjs install
node .yarn/releases/yarn-4.4.1.cjs workspace @calavelas/scaffolder-module-endr build
```

## Backstage Backend Registration

Register this module in `packages/backend/src/index.ts`:

```ts
backend.add(import('@calavelas/scaffolder-module-endr'));
```
