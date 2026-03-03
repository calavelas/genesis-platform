# TARS Scaffold Module

Service generation and GitOps file rendering engine.

Capabilities:
- render service code template into `SVCS/<name>`
- render GitOps application manifests under `KUBE/clusters/mac/lab/services`
- stage files for dry-run or write mode
- commit changes and open GitHub pull requests when configured
