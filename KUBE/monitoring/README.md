# Monitoring

Monitoring stack notes for local cluster.

Current default:
- monitoring stack is not installed by default bootstrap
- install and manage monitoring via GitOps manifests when needed

Access:
- if monitoring is installed, use `make -f SCPT/Makefile port-forward-grafana`.
