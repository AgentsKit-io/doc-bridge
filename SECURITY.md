# Security Policy

## Supported versions

Security fixes target the latest stable `@agentskit/doc-bridge` release on npm.

## Reporting a vulnerability

Please do not open a public issue for security reports.

Email security reports to `security@agentskit.io` with:

- affected version or commit
- reproduction steps
- impact
- any suggested fix

We will acknowledge reports as soon as practical and coordinate disclosure before publishing details.

## Security expectations

- Core commands must work without sending repository content to a network service.
- MCP `doc.get` must only read indexed docs inside the project root.
- Optional intelligence features must stay opt-in and provider-controlled by the user.
