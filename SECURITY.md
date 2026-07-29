# Security Policy

## Supported versions

Security fixes target the latest stable `@agentskit/doc-bridge` release on npm.

## Reporting a vulnerability

Please do not open a public issue for security reports.

Use [GitHub private vulnerability reporting](https://github.com/AgentsKit-io/doc-bridge/security/advisories/new) when possible. If that channel is unavailable, email `security@agentskit.io`.

Include:

- affected version or commit
- reproduction steps
- impact
- any suggested fix

Please do not include secrets or private repository content beyond what is
necessary to reproduce the issue. We aim to acknowledge a complete report
within 14 days, investigate it, and coordinate disclosure and remediation with
the reporter before publishing details.

## Security expectations

- Core commands must work without sending repository content to a network service.
- MCP `doc.get` must only read indexed docs inside the project root.
- Optional intelligence features must stay opt-in and provider-controlled by the user.
