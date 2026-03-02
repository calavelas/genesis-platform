# Root App (App-of-Apps)

Defines the ArgoCD root application for local cluster deployment.

Files:
- `root-application.yaml`: points ArgoCD at `KUBE/clusters/local/apps`.
- `kustomization.yaml`: groups root-app resources.
