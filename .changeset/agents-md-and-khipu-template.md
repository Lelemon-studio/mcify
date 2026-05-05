---
'@mcify/cli': minor
---

`mcify init` projects are now AI-agent ready out of the box.

- Added `AGENTS.md` to the `from-scratch` template. Universal contract
  for any AI assistant (Claude Code, Cursor, Cody, Windsurf,
  Copilot Workspace) — covers project layout, the canonical pattern
  for adding tools, schema helpers, auth, the testing approach with
  `createTestClient`, conventions, and anti-patterns specific to mcify
  projects.

- New template `example-khipu` (try with
  `mcify init my-project --template example-khipu`). Clones the
  reference Khipu connector — `KhipuClient` + two tools
  (`khipu_create_payment`, `khipu_get_payment_status`) wrapped in
  `requireAuth` + `rateLimit` + `withTimeout` middleware — as a
  standalone runnable project. Ships with its own AGENTS.md tuned to
  the connector pattern and a README that walks through env setup,
  wiring to Claude Desktop / Cursor / Lelemon Agentes, and extending.
