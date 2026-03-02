# Monitoring

Monitoring stack notes for local cluster.

Current default:
- `kube-prometheus-stack` via Helm (installed by `SCPT/bootstrap.sh`)

Access:
- Grafana is exposed locally through `make -f SCPT/Makefile port-forward`.
