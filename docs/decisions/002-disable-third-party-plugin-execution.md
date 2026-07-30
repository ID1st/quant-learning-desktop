# ADR-002: Keep third-party plugin execution disabled

## Status

Accepted and implemented on 2026-07-30. Supersedes
[ADR-001](./001-plugin-runtime-isolation.md).

## Context

ADR-001 moved installed strategy code out of the renderer and attempted to
isolate it in an Electron Utility Process with Node `vm`. Adversarial review
showed that code evaluated in that design could recover Node capabilities
through host-realm constructors. A Utility Process is Node-enabled, and
`node:vm` is not a security boundary for hostile code.

Continuing to execute third-party source would expose local files, provider
credentials, desktop bridges, and network access outside the declared plugin
capabilities. Describing the previous boundary as isolated would therefore
create a false security guarantee.

## Decision

- Third-party strategy, indicator, data-source, and export code execution
  remains disabled.
- Installed source is never sent to the renderer and is not evaluated by the
  main process or the dormant utility entry.
- The production build does not emit a plugin Utility Process executable
  entry.
- Local packages may still be selected, copied into the managed plugin
  directory, schema/version/permission checked, listed, enabled, disabled, and
  uninstalled.
- Enable state, declared permissions, compatibility errors, and blocked
  execution failures remain visible. Enablement is management state only; it
  does not authorize execution.
- Built-in strategies and indicators remain available because they are
  reviewed application modules compiled into the release, not installed
  third-party source.
- The packaged Electron smoke test must prove that a strategy request is
  rejected without reading source or starting a plugin process.

## Conditions for reconsidering execution

Execution may be proposed again only when all of the following are implemented
and independently reviewed:

1. A genuinely no-Node sandbox that exposes no Electron, Node, filesystem,
   process, credential, provider, network, or renderer object by default.
2. A versioned, capability-only message protocol with exact schema validation
   on every input and output.
3. Per-run CPU time, memory, input, output, and concurrency quotas plus a parent
   watchdog that can terminate the sandbox.
4. Per-capability hosts and policies for strategies, indicators, data sources,
   and exporters; permission declarations alone are not an isolation boundary.
5. Signed packages or a curated registry, provenance verification, explicit
   user consent history, and audited update/rollback behavior.
6. Adversarial escape, denial-of-service, malformed-message, credential
   exposure, and packaged-build regression tests reviewed outside the
   implementation author.
7. A fail-closed rollout switch and an incident response path that can disable
   all third-party execution without blocking plugin management.

A new ADR and security review are required before changing the fail-closed
runtime behavior.

## Consequences

- Users can prepare and manage local plugin packages, but those packages cannot
  contribute runtime strategies, indicators, providers, or exports.
- The UI and documentation must distinguish “enabled for management” from
  “executing.”
- Runtime requests produce a stable unavailable error and may increment the
  existing failure counter; they never evaluate installed code.
- Capability expansion is deferred, but renderer and credential boundaries
  remain enforceable and testable.
