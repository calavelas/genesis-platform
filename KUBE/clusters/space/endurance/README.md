# Endurance Platform Apps

Platform service ArgoCD child `Application` manifests live here (for example: `KIPP`, `CASE`).

Expected pattern:
- one file per platform service
- each file is an ArgoCD `Application`

This directory is intended for platform-level services, separate from `gargantua/` service apps generated from `SVCS`.

Current usage:
- `gateways/`: Gateway API resources and local TLS secret managed via ArgoCD.
