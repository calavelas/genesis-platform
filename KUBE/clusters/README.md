# Cluster Definitions

Cluster-specific GitOps configuration lives here.

Current targets:
- `mac/lab`: local k3d environment used for development and validation.
- `gcp/dev`: reserved for future cloud development cluster.
- `gcp/prd`: reserved for future production cluster.

Each cluster path should follow the same layout:
- `core.yaml` as bootstrap ArgoCD `Application`.
- `core/` with app-of-apps child definitions.
- `platform/` for platform applications.
- `services/` for generated service applications.
