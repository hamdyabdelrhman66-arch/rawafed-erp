# Security audit

## Executive result

Status: **not production approved**. Repository hardening is materially improved, but browser-accessible refresh tokens, unverified production TLS/proxy behavior, incomplete endpoint validation coverage, and missing penetration testing remain critical gates.

## Controls verified or improved

- JWT and refresh signatures require separate production secrets; HS256, issuer, audience, and expiry are verified.
- Refresh tokens are hashed at rest and revoked on logout, password change, and user deactivation.
- PostgreSQL authorization checks active user state on every protected request.
- Login and global API rate limits emit standard limit headers.
- Production requires explicit non-wildcard CORS origins. Helmet, compression, proxy trust, hidden framework headers, body limits, and request timeouts are enabled.
- Password creation/change requires 12–128 characters; bcrypt cost is 12 in PostgreSQL services.
- Hardcoded demo credentials were removed. Legacy development seeding is opt-in and forbidden in production.
- Upload filenames are server generated; allowed MIME values, maximum size, magic bytes, dotfiles, static indexes, and path traversal are restricted.
- Prisma parameterization prevents SQL injection in repositories. Raw reporting queries contain no user interpolation.
- Error responses redact database, token, secret, filesystem, and stack details. Structured logs do not serialize headers or bodies.
- Bearer tokens moved from persistent `localStorage` to per-tab `sessionStorage`.

## Open findings

| Severity | Problem | Impact | Required remediation |
|---|---|---|---|
| Critical | Refresh and access tokens remain JavaScript-readable | XSS can steal a full session | Move refresh token to `HttpOnly; Secure; SameSite=Strict` cookie, rotate on every refresh, keep access token only in memory |
| Critical | No independent penetration/access-control test | Broken object-level authorization may remain across 109 routes | Test every role/endpoint/object combination in staging |
| High | Legacy SQLite handlers coexist until cutover | Older validation/password behavior remains reachable under SQLite | Complete PostgreSQL verification, cut over, then remove legacy code |
| High | Uploads are stored on application disk | Malware scanning and durable object storage are absent | Use private object storage, antivirus scanning, signed downloads, retention rules |
| High | CSP has not been tailored to Angular/PDF workers | XSS mitigation may be weaker than intended | Deploy nonce/hash-based CSP and test PDF/worker flows |
| High | Root production dependency audit still has transitive findings | Known vulnerable build/runtime packages may remain | Review `npm audit`, upgrade Angular/tooling dependencies, document accepted risks |
| Medium | No MFA or step-up authentication | Privileged account takeover has high impact | Add IdP/MFA before broad production access |
| Medium | No distributed rate-limit store | Multiple Render instances multiply brute-force allowance | Use Redis-backed rate limiting |
| Medium | No CSRF tokens | Bearer headers are currently not ambient, but future cookies change the threat | Add origin/CSRF enforcement with the HttpOnly refresh-cookie change |
| Medium | No automated secret scanning/SBOM signing | Leaked secrets or supply-chain changes may go unnoticed | Add gitleaks, dependency review, SBOM, provenance and image signing in CI |

TLS must terminate at Render/reverse proxy with HTTPS redirects and HSTS verified in staging. Never expose Neon direct credentials to the browser.
