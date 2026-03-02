# GitHub Workflows

This folder contains CI/CD workflows for the platform.

Key workflows:
- `workflows/genesis-reconcile.yml`: runs `TARS/TARS.py genesis` when `ENDR.yaml` or `SVCS.yaml` changes.
- `workflows/validate-services.yml`: validates service/backend/frontend changes.
- `workflows/validate-platform.yml`: validates GitOps/Kubernetes/template changes.
- `workflows/publish-service-images.yml`: builds and pushes changed service images to Docker Hub.
