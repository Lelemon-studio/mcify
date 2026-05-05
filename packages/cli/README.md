# @mcify/cli

Command-line tool for mcify. Scaffolds, runs, builds, and deploys MCP servers.

> **Status:** scaffold. Commands `init`, `dev`, `build`, `deploy`, `generate` arrive in Phase A.5.

## Install

```bash
# Quick try
npx @mcify/cli init my-mcp

# Or globally
npm install -g @mcify/cli
mcify init my-mcp
```

## Commands

| Command | Description | Phase |
|---|---|---|
| `mcify init <name>` | Scaffold a new MCP server | A.5 |
| `mcify dev` | Run the server with hot reload and inspector | A.5 + B |
| `mcify build` | Build for production | A.5 |
| `mcify deploy <target>` | Deploy to Workers / Fly / Railway / Docker | D |
| `mcify generate` | Generate typed client SDK | A.5 |

## License

Apache 2.0.
