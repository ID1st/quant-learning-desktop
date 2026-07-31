# Administrator invite operations

## Production configuration

The authorized administrator email is production configuration, not source code. Set the requested address in
`/opt/quant-auth/secrets/auth.env`:

```dotenv
AUTH_ADMIN_EMAIL=<authorized-admin-email>
```

For a fresh host, pass the value to the first deployment so its staging copy of the bootstrap script can write
the protected environment file:

```bash
sudo AUTH_ADMIN_EMAIL='<authorized-admin-email>' bash \
  /opt/quant-auth/incoming/deploy-release.sh \
  /opt/quant-auth/incoming/quant-auth-<release-id>.tar.gz \
  <release-id>
```

Deployment runs the idempotent administrator provisioning CLI after migration and before starting the candidate
auth service. It aborts if the database already contains a different administrator.

## Web access

- Open `https://fnndp.xyz` and choose **管理员登录**, or open `https://fnndp.xyz/admin`.
- Enter the pre-authorized email and the six-digit code delivered by email.
- There is no registration or password flow.
- Closing the browser discards the cookie; the server also enforces a twelve-hour absolute limit.
- Invite plaintext is shown once. Download the CSV before refreshing or leaving the page.
- Revoking a batch affects only active, unused codes. Redeemed entitlements remain unchanged.

The site proxies only `/api/admin/*` to the internal `/v1/admin/*` API. Direct requests to
`https://auth.fnndp.xyz/v1/admin/*` return 404.

## Non-consuming invite diagnosis

Use the production container and pipe the candidate code through standard input. Do not place it in shell
history or command arguments:

```bash
read -rs invite_code
printf '%s' "${invite_code}" | docker compose \
  -f /opt/quant-auth/current/deploy/cloud/docker-compose.yml \
  exec -T -u 0 auth \
  node apps/cloud-server/dist/cli/inviteBatchVerify.js \
  --batch-id <batch-id>
unset invite_code
```

The command returns only format, batch match and status booleans. It does not redeem the code or print the
plaintext, digest or pepper.

When the desktop shows a request number, correlate it with Nginx and auth logs:

```bash
sudo grep '<request-id>' /var/log/nginx/quant-auth-access.log
docker compose \
  -f /opt/quant-auth/current/deploy/cloud/docker-compose.yml \
  logs auth | grep '<request-id>'
```

The desktop diagnostic manifest records the application version and the effective authentication origin. It
does not include credentials, tokens, email codes or invite codes.

## Release and rollback checks

Before release:

1. Configure `AUTH_ADMIN_EMAIL` and verify the SMTP sender.
2. Run all tests with a disposable real PostgreSQL `TEST_DATABASE_URL`.
3. Build the cloud archive; it must contain `apps/admin-web/dist/index.html`.
4. Confirm migration 003 and administrator provisioning complete.
5. Verify `/admin`, secure cookie attributes, exact-origin rejection and the 404 boundary on the auth subdomain.
6. Generate one 7-day code and complete one real desktop renewal.
7. Verify the code becomes `REDEEMED` and reuse is rejected.

`deploy-release.sh` activates the auth service, Web assets and Nginx configuration under one release ID.
`rollback-release.sh` restores the previous API, site assets and Nginx configuration. Database migrations are
additive so the previous auth image remains startable.
