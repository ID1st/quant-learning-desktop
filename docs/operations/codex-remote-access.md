# Codex remote operations

Codex uses separate trust boundaries for source control and cloud operations:

- Git records and reviews code changes.
- Alibaba Cloud CLI uses browser-based OAuth credentials. Do not create a
  long-lived AccessKey for Codex.
- Cloud Assistant invokes pre-created commands. Port 22 remains closed.
- The default `quant-auth-codex` identity is audit-only. Production deployment
  must use a separate identity and a fixed deployment command with an explicit
  operator confirmation.

## Current audit scope

- RAM user: `quant-auth-codex-audit`
- Custom policy: `QuantAuthCodexReadonlyAudit`
- Local CLI profile: `quant-auth-codex` (`OAuth`, China site)
- Region: `cn-hongkong`
- ECS instance: `i-j6c0kp5inx82hnn0f75w`
- Cloud Assistant command: `c-hk06shckbtwjj7k`
- Command name: `quant-auth-codex-readonly-audit`

The command runs only:

```text
/opt/quant-auth/current/deploy/cloud/scripts/quant-auth-ops-check.sh
```

Run the check after the OAuth profile is configured:

```powershell
npm run ops:cloud:audit
```

The wrapper accepts no shell text or alternate target, so routine
checks cannot become arbitrary root command execution.

The initial verification completed successfully on 2026-07-30:

- STS reported the caller as
  `acs:ram::1910951675306863:user/quant-auth-codex-audit`.
- The fixed Cloud Assistant audit returned exit code `0`.
- An unrelated `ecs:DescribeInstances` request was denied.

OAuth configuration is stored in the current Windows user's Alibaba Cloud CLI
configuration directory. Never copy that directory into the repository,
release archives, support bundles, or workstation backups that are shared with
other people.

## Complete the OAuth profile

An Alibaba Cloud RAM administrator must first assign
`quant-auth-codex-audit` to the installed `official-cli` OAuth application.
The RAM user must also have console sign-in enabled. Set its password directly
in the Alibaba Cloud console; never store or paste that password into this
repository or a Codex task.

Then configure the local, short-lived profile:

```powershell
& "$env:LOCALAPPDATA\AliyunCLI\aliyun.exe" configure `
  --profile quant-auth-codex `
  --mode OAuth
```

Choose the China (`CN`) sign-in site and authenticate as
`quant-auth-codex-audit`, not as the Alibaba Cloud account owner. The resulting
OAuth profile uses temporary credentials and does not require an AccessKey.

## Git remote

The private GitHub remote is:

```powershell
git remote -v
# origin git@github.com:ID1st/quant-learning-desktop.git
```

Authentication uses a repository-scoped, read/write deploy key:

```text
C:\Users\Admin\.ssh\id_ed25519_quant_learning_desktop
```

The repository-local `core.sshCommand` forces Git to use only this key. It
cannot authenticate to other repositories. The broader Git Credential Manager
authorization for all private repositories was intentionally declined.

The local stable branch `master` tracks the remote default branch `main`.
The current feature branch tracks
`origin/codex/auth-entitlements`.

Verify the connection:

```powershell
git remote -v
git ls-remote --heads origin
```

Do not put a personal access token, private key, or OAuth credential in the URL,
`.env`, repository Git configuration, source tree, or release artifacts.

Before pushing:

```powershell
git status --short
git diff --check
npm run check
git push -u origin codex/auth-entitlements
```

## Production release boundary

Do not grant the audit identity `ecs:RunCommand`, `ecs:CreateCommand`, file
upload, security-group, RAM, or unrestricted ECS permissions.

A production release should follow this sequence:

1. Merge reviewed changes into the protected release branch.
2. Run `npm run check`.
3. Build an immutable archive with `scripts/build-cloud-release.ps1`.
4. Verify the archive SHA-256.
5. Transfer the archive through an approved artifact channel.
6. Invoke one fixed Cloud Assistant deployment command that accepts only a
   release ID and expected digest.
7. Run the audit command and HTTPS smoke checks.
8. Roll back through a separate fixed command if validation fails.

The deployment identity and fixed command must not be created until the Git
remote and artifact transfer channel are selected. This prevents an incomplete
deployment path from receiving production write access.

## Revocation

If the workstation is lost or access is no longer required:

```powershell
aliyun configure delete --profile quant-auth-codex
```

Then remove the RAM user from the `official-cli` OAuth application assignments
and detach `QuantAuthCodexReadonlyAudit`. Removing the local profile alone does
not revoke the server-side OAuth grant.
