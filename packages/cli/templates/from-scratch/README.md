# {{name}}

MCP server scaffolded with [mcify](https://mcify.dev).

## Develop

```bash
pnpm install
pnpm dev
```

The server listens on `http://localhost:8888/mcp`. Connect Claude Desktop, Cursor, Claude Code, or any MCP client.

## Add tools

Edit `mcify.config.ts` (or split tools into `tools/`):

```ts
import { defineTool } from '@mcify/core';
import { z } from 'zod';

export const myTool = defineTool({
  name: 'my_tool',
  description: 'What this does',
  input: z.object({ /* ... */ }),
  output: z.object({ /* ... */ }),
  handler: async (input, ctx) => {
    // ...
  },
});
```

Register it in `mcify.config.ts`:

```ts
export default defineConfig({
  name: '{{name}}',
  version: '0.1.0',
  tools: [myTool],
});
```

## Build for production

```bash
pnpm build
```

Outputs `dist/server.mjs`. Run with:

```bash
PORT=8888 node dist/server.mjs
```

## Generate a typed client

```bash
pnpm generate
```

Emits `mcify-client.ts` with the available tool/resource/prompt names.

## Docs

- [mcify.dev](https://mcify.dev) — full documentation
- [github.com/Lelemon-studio/mcify](https://github.com/Lelemon-studio/mcify)
