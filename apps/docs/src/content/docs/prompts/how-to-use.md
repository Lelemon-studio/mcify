---
title: How to use these prompts
description: Copy a prompt, paste it into Claude Code / Cursor / Windsurf, get production-ready output.
---

The pages in this section are **prompts you can copy and paste into your AI coding assistant** to get correct, idiomatic mcify code on the first try. Each one assumes the assistant has access to these docs (via `llms-full.txt`) and your local repo.

## Two ways to use them

### Option 1: paste into a chat (Claude.ai / ChatGPT / Cursor agent)

Open the prompt page, click the copy button on the prompt block, paste into your assistant. The prompt starts with a context-setting block that points at our `llms-full.txt`, so the model can pull all the framework docs into its context before doing the work.

### Option 2: drop into Claude Code / Cursor as a slash command

Each prompt has a frontmatter block at the top you can save as a project-level slash command:

```bash
# Claude Code
mkdir -p .claude/commands
curl -o .claude/commands/add-mcp-tool.md https://docs.mcify.dev/prompts/add-tool/raw

# Cursor (similar — paste into .cursor/rules/)
```

Then `/add-mcp-tool` in Claude Code triggers the prompt with the rest of your conversation as input.

## Why this works

mcify ships three things specifically for this loop:

1. **`docs.mcify.dev/llms-full.txt`** — every page of these docs in one markdown file. Models can read it in one fetch.
2. **`AGENTS.md`** — every `mcify init` scaffold ships with one. Claude Code, Cursor, Cody, Windsurf, and Copilot Workspace all read it automatically.
3. **Slash commands in templates** — `from-scratch` and `from-zod` templates include `.claude/commands/add-tool.md` so the slash command works out of the box.

## Available prompts

| Prompt                                               | What it does                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Add a tool](/prompts/add-tool/)                     | Tell the assistant what API call you want to expose. It scaffolds the tool with the right schemas, middleware, and tests. |
| [Wrap an existing API](/prompts/wrap-api/)           | Point at an OpenAPI spec or a few endpoints. The assistant generates a full mcify connector.                              |
| [Debug a misbehaving tool](/prompts/debug-tool/)     | Paste the error or the agent transcript. The assistant locates the bug (schema mismatch, auth, timeout, side effect).     |
| [Migrate to multi-spec](/prompts/migrate-multispec/) | You already have one MCP server. The assistant adds N microservices behind it via `generate from-openapi`.                |

## Building your own

Every prompt in this section starts with the same three-block structure:

```markdown
You are helping a developer build an MCP server with mcify.

Read these docs first to ground your knowledge:

- https://docs.mcify.dev/llms-full.txt

Project context:
[the developer's repo state here, if relevant]

Task:
[what the developer wants done]

Conventions:

- TypeScript strict, ES modules, Node ≥ 20.
- Zod schemas for inputs and outputs (defineTool).
- requireAuth + rateLimit + withTimeout middleware on every tool.
- Snake-case, service-prefixed tool names.
- Per-field .describe() on every input.
- See https://docs.mcify.dev/guides/antipatterns/ for what to avoid.
```

Reuse that scaffold; swap in the task. The "Read these docs first" line is the load-bearing one — without it, the model relies on stale training data.
