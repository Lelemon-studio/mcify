# 0001. TypeScript-first runtime, not Python

- **Status**: accepted
- **Date**: 2026-05-05

## Context

The MCP ecosystem in early 2026 has two server libraries with traction: FastMCP (Python) and the official `@modelcontextprotocol/sdk` (TypeScript). Most enterprise AI integrations land on TypeScript because the surrounding tooling (LangChain JS, AI SDK, Cloudflare Workers, Vercel AI, Cursor) is TypeScript-first.

mcify's primary users are devs and vendors building MCP servers around their existing APIs. Most of those APIs already have TypeScript SDKs. The competition (Speakeasy Gram, Composio) is also TypeScript-leaning.

Edge runtime support (Cloudflare Workers, Bun, Deno) is a hard requirement for the cloud upsell. Python's edge story is weak; FastMCP cannot run on Workers.

## Decision

The mcify runtime, builder library, and CLI are written in TypeScript with strict mode and ESM. The MCP protocol layer integrates `@modelcontextprotocol/sdk` (the official Anthropic SDK), not a hand-rolled or Python-derived implementation.

A Python adapter — if it ships at all — happens after V1 and lives in a separate package, not in the core runtime.

## Alternatives considered

- **FastMCP fork or wrapper**: would have given us a faster start but locks us out of Workers, doubles the maintenance surface (we'd be tracking upstream Python releases), and forks the language community in two for our docs. Lost.
- **Hand-rolled MCP without the SDK**: more control but the protocol evolves quickly and the SDK already handles the boring parts (transport framing, JSON-RPC envelope validation). Lost.

## Consequences

- **Becomes easier**: edge runtime support, type safety end-to-end (Zod schemas → handler args → response → generated client), reuse of the broader TS ecosystem (Hono, esbuild, Bun, Wrangler).
- **Becomes harder**: serving Python-shop developers — they get a "Python adapter coming" answer at best.
- **What we're betting on**: TypeScript stays the default language for AI integrations through 2027+. If Python ascends in this niche, we revisit.
- **Reversibility**: low. Switching languages mid-flight would be a rewrite, not a refactor.
