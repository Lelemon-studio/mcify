---
title: Connect to Claude / Cursor / agents
description: Wire your local mcify server to the AI client of your choice.
---

Once `mcify dev` is running, the MCP endpoint is at `http://localhost:8888/mcp`. Every MCP-compatible client connects the same way: URL + (optional) bearer token.

## Claude Desktop

Edit:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "weather": {
      "url": "http://localhost:8888/mcp",
      "headers": {
        "authorization": "Bearer YOUR_MCIFY_AUTH_TOKEN"
      }
    }
  }
}
```

Restart Claude Desktop. The tools appear automatically.

## Cursor

Same `mcpServers` shape. Edit `.cursor/config.json` in your project:

```json
{
  "mcpServers": {
    "weather": {
      "url": "http://localhost:8888/mcp",
      "headers": { "authorization": "Bearer YOUR_MCIFY_AUTH_TOKEN" }
    }
  }
}
```

Or set it globally in Cursor's settings → MCP. Reload the editor.

## Claude Code

Claude Code reads from `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "weather": {
      "url": "http://localhost:8888/mcp",
      "headers": { "authorization": "Bearer YOUR_MCIFY_AUTH_TOKEN" }
    }
  }
}
```

Inside a Claude Code session: `/mcp` lists registered servers and their tools.

## A custom agent

If you're building your own agent on top of the [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk):

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:8888/mcp'), {
  requestInit: { headers: { authorization: 'Bearer YOUR_MCIFY_AUTH_TOKEN' } },
});

const client = new Client({ name: 'my-agent', version: '0.1.0' }, { capabilities: {} });
await client.connect(transport);

const tools = await client.listTools();
console.log(tools);
```

## The mcify inspector itself

`mcify dev` already starts a local web UI at [http://localhost:3001](http://localhost:3001). It has its own **Chat** tab that talks to Claude or GPT-4 directly from the browser, with your tools registered. Bring an API key (Anthropic or OpenAI), pick a model, type a message — the model uses your tools for real.

Useful for kicking the tires before connecting an external agent.

## Verify the connection

In the client, ask "what tools do you have available?" — your tool names (`weather_get_current`, etc.) should appear. If not:

| Symptom                     | Probable cause                                    | Fix                                                                       |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Client says "no tools"      | Wrong URL or port.                                | Confirm `mcify dev` is running and the port matches your client config.   |
| `401 Unauthorized`          | Token mismatch.                                   | Make sure the client's `authorization` header matches `MCIFY_AUTH_TOKEN`. |
| Connection times out        | Local firewall, or you bound to a different host. | Run with `mcify dev --port 8888 --host 127.0.0.1`.                        |
| Tools list, but invoke 500s | Bug in your handler.                              | Open the **Calls Log** tab in the inspector — full error trace.           |

## Going beyond local

The client config doesn't change when you ship — only the URL does:

```json {3-4}
{
  "mcpServers": {
    "weather": {
      "url": "https://my-mcp.workers.dev/mcp",
      "headers": { "authorization": "Bearer prod_token" }
    }
  }
}
```

See [Deploy → Overview](/deploy/overview/) for the per-target setup.
