---
title: What is mcify
description: A small, opinionated framework for building MCP servers in TypeScript.
---

mcify is to MCP servers what Hono is to HTTP servers: a small, opinionated framework that handles the protocol boilerplate so you only write your tools' business logic.

The Model Context Protocol (MCP) is Anthropic's spec for letting AI agents discover and call tools. An MCP server is the thing on the other end — the one that actually executes the tools, returns data, and (often) talks to your business APIs.

## The pieces

| Package            | What it gives you                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `@mcify/cli`       | The `mcify` binary. `init`, `dev`, `build`, `generate`, `deploy`.                               |
| `@mcify/core`      | `defineTool`, `defineResource`, `definePrompt`, `defineConfig`, schema/auth/middleware helpers. |
| `@mcify/runtime`   | The MCP server runtime. stdio + HTTP transports. Adapters for Node, Bun, Workers. Event bus.    |
| `@mcify/inspector` | Local web UI served by `mcify dev` at `:3001`. Tools list, calls log, playground, chat tab.     |

## Design tenets

- **Type-safe end-to-end.** One Zod schema is your handler args, your JSON Schema for `tools/list`, and your generated client types. No drift.
- **Edge-first.** The same handler runs on Cloudflare Workers, Vercel Edge, Bun, Node, or Docker. Adapters live in the runtime; you don't rewrite tools.
- **AI-agent-aware.** Every scaffold ships an [`AGENTS.md`](https://github.com/openai/agents.md) so Claude Code / Cursor / Cody / Windsurf / Copilot Workspace already know your project's conventions.
- **Composable middleware.** `requireAuth`, `rateLimit`, `withTimeout` ship in core. Wrap any tool. Compose like Express/Hono.
- **Self-host or cloud.** Apache 2.0 OSS today; managed hosting via mcify Cloud later for vendors who don't want to manage infra.

## When to use it

- You have an existing API and want an AI agent to call it.
- You want to wrap multiple internal microservices behind one MCP server.
- You need bearer / API-key auth, rate limiting, and per-tool timeouts in production.
- You want the same code to run on edge and on a self-hosted box.

## When not to use it

- You're writing an MCP **client** (the agent side). Use the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) instead — that's what AI apps consume.
- You don't need typed schemas. The `@modelcontextprotocol/sdk` server side is fine if you'll write JSON Schemas by hand and don't want any abstraction.

## Next

- [Install](/start/install/) — get the CLI on your machine.
- [Your first MCP server](/start/first-server/) — `init` → `dev` → connect a client.
- [Connect to Claude / Cursor](/start/connect-clients/) — wire it up to a real agent.
