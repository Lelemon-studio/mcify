# @mcify/example-fintoc

## 0.1.0-alpha.1

### Minor Changes

- [`5115431`](https://github.com/Lelemon-studio/mcify/commit/51154311eff18105f70db124938f6204bb7941b1) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Two new reference connectors — closes Phase C.2 and C.3 — plus
  bilingual READMEs across all three examples.

  **`@mcify/example-bsale`** — Chilean DTE / facturación electrónica
  through Bsale. Four tools: `bsale_emit_dte` (factura/boleta),
  `bsale_list_invoices`, `bsale_get_invoice`, `bsale_list_clients`. The
  connector ships a typed `BsaleClient` that wraps the Bsale REST API
  without pulling an SDK, so the deployed worker stays small. Auth is
  the merchant `access_token` header. Tools run with `requireAuth +
rateLimit + withTimeout` middleware (lower rate on emit because DTEs
  have legal weight). 6 tests pass without any Bsale credentials —
  `fetch` is mocked against fixed JSON snapshots.

  **`@mcify/example-fintoc`** — open banking for Chile and Mexico
  through Fintoc. Three tools: `fintoc_list_accounts`,
  `fintoc_get_account_balance`, `fintoc_list_movements`. Two-credential
  auth model: organization `secret_key` lives on the server, per-user
  `link_token` is passed as a tool input so the agent can scope each
  call to the right end-user connection. 8 tests cover happy path,
  URL encoding of account ids, error mapping, and the Authorization
  header (Fintoc uses the secret key directly — no `Bearer` prefix).

  **Bilingual READMEs.** All three examples now ship `README.md`
  (English) + `README.es.md` (Spanish), cross-linked at the top. The
  `packages/examples/README.md` index lists the three connectors with
  status, tool count, and how to copy one as a starting template.
