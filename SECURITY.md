# Security Policy

## Supported versions

mcify is in active early development. Until V1.0.0, only the latest minor release receives security updates.

| Version | Supported |
|---|---|
| Latest 0.x | Yes |
| Older 0.x | No |

After V1.0.0 ships, we will publish a formal support window (latest two minor releases at minimum).

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately by either of the following methods:

1. **GitHub Security Advisory:** [Open a private advisory](https://github.com/Lelemon-studio/mcify/security/advisories/new) on this repository. This is the preferred channel.
2. **Email:** `contacto@lelemon.cl` (PGP key available on request).

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce, including affected versions.
- Any proof-of-concept code or commands.
- Your name and contact, if you would like credit.

## What to expect

- **Acknowledgment:** within 3 business days.
- **Initial assessment:** within 7 business days, including severity classification (CVSS) and a tentative fix timeline.
- **Disclosure timeline:** by default, we follow a 90-day coordinated disclosure window. We will work with you to extend this if needed for complex issues.
- **Fix and release:** patch released as soon as a verified fix is ready. CVE assigned for high-severity issues.
- **Credit:** if you wish, we will credit you in the release notes and the GitHub Security Advisory.

## Scope

In scope:

- Source code in this repository (`@mcify/cli`, `@mcify/core`, `@mcify/runtime`, `@mcify/inspector`).
- Default templates produced by `mcify init`.
- Helm chart and Dockerfile published from this repo.

Out of scope:

- mcify Cloud (`mcify.cloud`) — has its own disclosure policy at `https://mcify.cloud/security`.
- Third-party MCP servers built on mcify — report directly to their maintainers.
- Vulnerabilities in upstream dependencies — report to the upstream project; we will track and update.

## Hardening recommendations for self-hosters

Until we publish a full hardening guide, the basics:

- Always validate tool inputs with Zod schemas at the boundary.
- Never log credentials or PII. The default logger redacts known fields; verify your custom fields.
- Run the runtime under a non-root user in production.
- Pin the runtime version in production deployments. Do not auto-update.
- Use auth helpers (`bearer`, `apiKey`, `oauth`) provided by `@mcify/core`. Do not roll your own.

## Public disclosure

Resolved advisories are published at `https://github.com/Lelemon-studio/mcify/security/advisories`.
