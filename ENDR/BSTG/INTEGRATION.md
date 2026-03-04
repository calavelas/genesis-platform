# Backstage Integration Notes

## 1) Register the Template Location

In Backstage catalog locations, register:

- `url:/path/to/ENDR/BSTG/catalog-info.yaml` (or repository URL)

This exposes:

- `templates/create-service/template.yaml`

## 2) Register ENDR Scaffolder Actions

Build/install:

```bash
cd ENDR/BSTG/app
node .yarn/releases/yarn-4.4.1.cjs install
node .yarn/releases/yarn-4.4.1.cjs workspace @calavelas/scaffolder-module-endr build
```

Then wire the actions in your Backstage scaffolder backend:

```ts
import { createEndrScaffolderActions } from '@calavelas/scaffolder-module-endr';

const actions = [
  ...createEndrScaffolderActions(),
];
```

## 3) Configure Runtime Connectivity

Backstage must be able to reach ENDR backend API:

- `GET /api/plex/templates`
- `POST /api/plex/services`

The template default uses:

- `http://127.0.0.1:8000`

Override it in the form field `ENDR API URL` for non-local environments.

## 4) Token Requirement

For create flow (`dryRun=false`) ensure ENDR backend has:

- `GITHUB_TOKEN`

So PLEX/TARS can create branch/commit/PR.
