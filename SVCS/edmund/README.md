# edmund

## Overview

This service was created from the `python-fastapi` template in ENDR.

## Access

After `SVCS Build/Deploy` completes and ArgoCD sync is healthy, access this service at:

- [https://edmund.calavelas.net](https://edmund.calavelas.net)

## Runtime

- Namespace: `demo`
- Port: `8080`
- Service Template: `python-fastapi`
- GitOps Template: configured in `SVCS.yaml`

## Notes

- Source code is generated under `SVCS/edmund/`.
- Deployment resources are generated under `SVCS/edmund/chart/`.
