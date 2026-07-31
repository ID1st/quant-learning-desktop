# ADR 003: Isolated administrator invite console

- Status: accepted
- Date: 2026-07-31

## Context

Invite codes were previously generated on the server and delivered through a root-only CSV. A production
incident showed that the batch, digest, pepper and database row could all be correct while manual copying
between the CSV, terminal and desktop still caused a rejected renewal. We need a safer delivery path without
making invite validity enumerable or storing plaintext codes.

## Decision

The public site hosts a same-origin administrator console at `/admin`. Administrator identity is stored in
separate `admin_*` tables and is provisioned from the production-only `AUTH_ADMIN_EMAIL` setting. There is no
administrator registration route and no password login.

Login uses a short-lived email code and a browser-session `__Host-quant_admin` cookie. Mutating administrator
routes require the exact `https://fnndp.xyz` origin. The authentication subdomain returns 404 for all
administrator routes.

The console may generate mixed 7, 30, 90 and 365-day batches. Plaintext codes are returned once, held only in
page memory, and exported to CSV in the browser. PostgreSQL stores only the existing HMAC digest. Refreshing or
leaving the result page permanently discards the plaintext.

The desktop and cloud service share one NFKC-based invite normalization implementation. Public renewal errors
remain the generic `INVITE_INVALID`; a request ID is returned for support correlation. A root-only verification
CLI reads a candidate code from hidden standard input and reports booleans without consuming or disclosing it.

## Consequences

- Existing invite digests and desktop authentication APIs remain compatible.
- A lost Web result cannot be recovered; the administrator must revoke remaining codes and create a new batch.
- Email delivery and administrator sessions retain at-least-once outbox and server-side expiry semantics.
- Production deployment fails closed when `AUTH_ADMIN_EMAIL` is absent or conflicts with the existing singleton
  administrator.
- API, site assets and Nginx configuration roll back together by release ID.
