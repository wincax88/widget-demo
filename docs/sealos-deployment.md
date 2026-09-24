# Sealos deployment

The `main` branch publishes one image containing the Vite frontend and NestJS API to
`ghcr.io/wincax88/widget-demo`, then deploys it through `.github/workflows/sealos.yml`.
The workflow runs frontend and backend tests first. Backend integration tests use a
temporary PostgreSQL 16 service; production uses the separate Sealos database.

## Live resources

| Resource | Value |
| --- | --- |
| Sealos project | WidgetDemo, Guangzhou |
| Kubernetes namespace | `ns-gc40gxwh` |
| Public app URL | `https://xozqlkdilqkd.sealosgzg.site` |
| Deployment | `widget-demo` |
| Service | `widget-demo-zpnwdnljhyqs` (80 → 8080) |
| Ingress | `network-fzotifeztnjm` (owned by Sealos App Launchpad) |
| PostgreSQL cluster | `widget-demo-db` |
| PostgreSQL service | `widget-demo-db-postgresql` (5432) |
| Application database | `widget_demo` (created from `template0`) |

The workflow applies the ConfigMap, Service, and Deployment manifests under
`deploy/k8s`. It leaves the existing App Launchpad Ingress in place to avoid
creating a conflicting public route. `deploy/k8s/ingress.yaml` records the live
route for recovery, but is not applied automatically.

## Required secrets

The repository Actions secret `SEALOS_KUBECONFIG` must contain a kubeconfig with
access to this namespace. It is never committed to Git. The Kubernetes Secret
`widget-demo` must have:

- `DATABASE_URL`: a PostgreSQL URL for the Sealos database;
- `CREDENTIAL_ENCRYPTION_KEY`: a persistent, random 32-byte base64url value;
- `EDUPLUS_WEBHOOK_SECRET`: a persistent webhook signing secret also configured
  for this application in EduPlus.

Do not regenerate the latter two keys during ordinary deploys. Rotating the
encryption key without migrating encrypted tenant credentials makes stored
credentials unreadable. Never put these values in a workflow log or manifest
committed to Git.

Use the dedicated `widget_demo` database in `DATABASE_URL`, not the managed
instance's built-in `postgres` database: the latter contains provider objects
and Prisma rejects an initial migration against a nonempty schema. The migration
init container runs as UID/GID 1000 (the image's `node` user) and declares its
own memory budget; the namespace default of 64 MiB is too small for Prisma.

The container registry image must be pullable by the cluster. Make the GHCR
package public, or configure a long-lived, narrowly scoped `imagePullSecret`.

## Checks

After an Actions run succeeds:

```bash
kubectl -n ns-gc40gxwh rollout status deployment/widget-demo --timeout=5m
curl -fsS https://xozqlkdilqkd.sealosgzg.site/api/health/ready
curl -fsS https://xozqlkdilqkd.sealosgzg.site/v1/open/demo-school/widgets/schema
```

The app itself is reachable without an EduPlus subscription, but login,
directory sync, scores, and tenant-scoped Widget data require the application
registration, matching webhook secret, OAuth/OIDC environment, and an active
tenant subscription in EduPlus. Use the public URL above as the base URL and API
base URL; the callback path is `/api/auth/callback/:tenantCode`. The Widget
paths are `/v1/open/demo-school/widgets/schema`,
`/v1/open/demo-school/widgets/auth`,
`/v1/open/demo-school/widgets/token/refresh`, and
`/v1/open/demo-school/widgets/batch-data`.
