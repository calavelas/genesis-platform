# TARS CLI Module

Command-line entrypoints for reconciliation automation.

Primary flow:
- reads `ENDR.yaml` and `SVCS.yaml`
- renders expected service + GitOps files from templates
- computes drift and removed services via state tracking
- optionally opens GitHub pull requests
