# GitHub OAuth Setup (Local)

## 1. Create OAuth App
1. Open GitHub Settings -> Developer settings -> OAuth Apps.
2. Create a new OAuth App.
3. Use callback URL: `http://localhost:3000/api/auth/callback/github`.

## 2. Environment Variables
Set these for local development:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_OAUTH_REDIRECT_URL`

## 3. Backend Variables
Set these in `ENDR/.env` when implemented:
- `GITHUB_TOKEN` (server-side only)
- `GITHUB_OWNER`
- `GITHUB_REPO`

For `POST /api/services` with `dryRun=false`, `GITHUB_TOKEN` is required.

## Notes
- Browser should never receive privileged GitHub or Kubernetes tokens.
- PR-based workflow only; no direct writes to `main`.
