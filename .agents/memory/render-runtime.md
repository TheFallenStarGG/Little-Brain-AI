---
name: Render runtime
description: Production hosting shape and external GitHub authentication requirements
---

Production is designed as one Render web service: the API bundle starts the
Express process, serves the built frontend when `SERVE_WEB=true`, and exposes
the API under `/api`. GitHub snapshot and account persistence use the GitHub
Contents API with `GITHUB_TOKEN`; there is no platform connector fallback.

**Why:** Same-origin serving keeps the existing relative API paths and signed
cookies working without a host-specific proxy.

**How to apply:** Keep the Render build producing both artifacts, use
`/api/healthz` as the health check, and configure `GITHUB_TOKEN` and
`SESSION_SECRET` as deployment secrets.