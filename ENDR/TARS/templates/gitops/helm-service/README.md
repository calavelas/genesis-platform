# Template: helm-service

Generates Helm chart and ArgoCD Application manifest for a service.

Helm resources generated:
- `Deployment`
- `Service`
- `HTTPRoute` (when `httpRoute.enabled=true` in chart values)

Default `HTTPRoute` public URL is:
- `<service-name>.calavelas.net`
