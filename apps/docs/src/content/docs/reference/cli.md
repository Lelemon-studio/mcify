---
title: CLI reference
description: Every mcify command and its flags.
---

```
mcify <command> [options]
```

Run `mcify --help` to see this from the binary.

## init

Scaffold a new project from a template.

```bash
mcify init <name> [--template <name>] [--dir <path>]
```

| Flag                | Default        | What it does                                                             |
| ------------------- | -------------- | ------------------------------------------------------------------------ |
| `<name>`            | (required)     | Project name. Becomes `package.json`'s `name` and the default directory. |
| `--template <name>` | `from-scratch` | Template to use: `from-scratch`, `from-zod`, or `example-khipu`.         |
| `--dir <path>`      | `./<name>`     | Override the target directory.                                           |

## dev

Run the MCP server locally with hot reload + the inspector.

```bash
mcify dev [--port <n>] [--inspector-port <n>] [--no-inspector] [--no-watch] [--config <path>]
```

| Flag                   | Default             | What it does                    |
| ---------------------- | ------------------- | ------------------------------- |
| `--port <n>`           | `8888`              | MCP HTTP port.                  |
| `--inspector-port <n>` | `3001`              | Inspector UI port.              |
| `--no-inspector`       | off                 | Disable the inspector entirely. |
| `--no-watch`           | off                 | Disable file-watching restarts. |
| `--config <path>`      | `./mcify.config.ts` | Path to your config.            |

## build

Compile your config + tools into a deployable artifact.

```bash
mcify build [--target <node|workers|bun|vercel-edge>] [--out <dir>] [--bundle-deps]
```

| Flag            | Default | What it does                                                    |
| --------------- | ------- | --------------------------------------------------------------- |
| `--target`      | `node`  | Runtime target. Picks the right adapter and bundler config.     |
| `--out <dir>`   | `dist/` | Output directory.                                               |
| `--bundle-deps` | off     | Inline `node_modules` into the bundle (otherwise externalized). |

## generate

Two subcommands.

### `mcify generate` (no subcommand)

Emit a typed client SDK from your local config.

```bash
mcify generate [--config <path>] [--out <path>]
```

### `mcify generate from-openapi`

Generate Zod-typed tools from one or more OpenAPI specs. See [the from-openapi guide](/guides/from-openapi/) for the full workflow.

```bash
mcify generate from-openapi <spec> [--out <dir>]
mcify generate from-openapi --spec <prefix>=<src> [--spec ...] [--out <dir>]
```

| Flag                    | Default         | What it does                                      |
| ----------------------- | --------------- | ------------------------------------------------- |
| `<spec>`                | —               | URL or file path. Single-spec form.               |
| `--spec <prefix>=<src>` | —               | Repeatable. Each entry is `<name>=<url-or-path>`. |
| `--out <dir>`           | `src/generated` | Where the per-spec files land.                    |

## deploy

```bash
mcify deploy <target> [options]
```

Targets: `cloudflare` (alias `workers`), `vercel`, `fly`, `railway`, `docker`.

Per-target flags live in the [Deploy guides](/deploy/overview/). Common options:

| Flag              | Default             | What it does                                          |
| ----------------- | ------------------- | ----------------------------------------------------- |
| `--config <path>` | `./mcify.config.ts` | Path to your config.                                  |
| `--dry-run`       | off                 | Generate config + bundle, skip the actual deploy CLI. |

Each target also supports its own flags — see the per-target page.
