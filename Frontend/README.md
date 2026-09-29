# SRE Agent Console

The console uses typed, same-origin `/api/v1` calls for the incident queue, incident detail,
occurrence history, backend-approved lifecycle actions, repair start, and repair-run timeline. It
does not embed service URLs, internal bearer credentials, or provider credentials in the browser
bundle. Occurrences and both event/run lists use server pagination. Failed refreshes preserve the
last successful queue result and label it stale.

## Local development

Run `pnpm dev` with `docker compose up` (or the control API separately). Vite proxies `/api` to
`http://localhost:4000`. The Compose control API disables auth only for the local development
profile; never copy that setting into production.

## Production authentication boundary

The frontend and control API must be exposed only behind the organization's authenticated ingress
or BFF. The trusted edge must authenticate the human session, strip any user-supplied
`Authorization` header, then attach the control API's scoped `API_AUTH_TOKEN` server-side before
proxying `/api/`. Do not configure a browser token, put `API_AUTH_TOKEN` or
`INTERNAL_SERVICE_TOKEN` in `VITE_*`, local storage, cookies readable by JavaScript, or static
Nginx configuration. Keep the control API ClusterIP-only and do not expose it directly. This repo
does not choose an OIDC provider or implement organization identity/RBAC; that ingress configuration
is a deployment prerequisite, not a frontend bypass.

The static Nginx server proxies `/api/` to the in-cluster `control-api` and applies basic browser
security headers. It does not inject credentials or provide user authentication itself.
