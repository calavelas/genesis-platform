# kipp

## Overview

This service was created from the `python-fastapi` template in ENDR.

## Access

After `SVCS Build/Deploy` completes and ArgoCD sync is healthy, access this service at:

- [https://kipp.calavelas.net](https://kipp.calavelas.net)

## Runtime

- Namespace: `demo`
- Port: `8080`
- Service Template: `python-fastapi`
- GitOps Template: configured in `SVCS.yaml`

## Notes

- Source code is generated under `SVCS/kipp/`.
- Deployment resources are generated under `SVCS/kipp/chart/`.
