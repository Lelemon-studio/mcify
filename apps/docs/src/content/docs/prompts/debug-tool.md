---
title: Debug a misbehaving tool
description: Copy-paste prompt that finds the bug — schema mismatch, auth, timeout, or side effect.
---

Use this when an agent is calling your tool and something's wrong: the response is empty, args are validating but the upstream rejects them, the call times out, or the agent is picking the wrong tool entirely.

## Prompt

```markdown
You are debugging a misbehaving mcify MCP tool. Be methodical.

Read these docs first:

- https://docs.mcify.dev/llms-full.txt
- https://docs.mcify.dev/concepts/tools/
- https://docs.mcify.dev/guides/antipatterns/
- https://docs.mcify.dev/reference/runtime/#errors

What I'm seeing:
<<<
REPLACE THIS BLOCK with:

- The tool name.
- What I expected to happen.
- What actually happened (paste the error, the agent transcript, or
  describe the behavior).
- The relevant calls log entries from the inspector if you have them.
- The minimal reproduction (args that trigger the bug).
  > > >

Step through this checklist in order. Stop at the first one that
matches and fix it. Don't bulk-rewrite the tool.

1. **Schema mismatch — input.**
   - Did the args fail validation? The runtime throws `McifyValidationError`
     with `phase: 'input'` and the offending field. Read the `issues[]`
     array carefully — Zod tells you exactly what was wrong.
   - Common cause: too-strict `regex`, wrong `enum` values, missing
     `.optional()` on a field that the upstream marks optional.

2. **Schema mismatch — output.**
   - The handler returned, but the runtime threw `McifyValidationError`
     with `phase: 'output'`. Your output schema doesn't match the upstream
     response. Either widen the schema or map the response before returning.

3. **Auth — server level.**
   - 401 from `/mcp`? The agent's bearer token doesn't match
     `MCIFY_AUTH_TOKEN`. Check the env var on the deployed instance.
   - 401 inside the handler? Your upstream API key is wrong/missing.
     Check `process.env.<UPSTREAM>_API_KEY`.

4. **Auth — per-tool middleware.**
   - 403? `requireAuth({ check: ... })` rejected the scope. Check
     `ctx.auth.claims.scopes` against what your `check` predicate
     wants.

5. **Rate limit.**
   - 429? `rateLimit` is buckets-per-token; if the agent burst, it
     trips. For development, raise the limits or remove the middleware
     temporarily.

6. **Timeout.**
   - Handler hung past `withTimeout({ ms })`? Either raise the timeout
     or add upstream pagination/streaming so each call returns faster.

7. **Description / naming bug.**
   - The agent picked the wrong tool, or didn't pick yours when it
     should have. Fix the description (what it does, _when_ to use it).
     See https://docs.mcify.dev/guides/creating-effective-tools/ for
     the format.

8. **The agent is passing wrong args repeatedly.**
   - A field's `.describe()` is missing or unclear. Add format hints
     ("UUID, e.g. ...", "ISO 8601 in UTC", "amount in CLP").
   - Or the schema has overlap (two enums with similar names; a
     `string` that should be an `enum`).

9. **Side effect happening unexpectedly.**
   - Document the side effect in the tool's description. Then optionally
     add a `dry_run: boolean` input the agent can pass to preview.

10. **Nothing above matches.**
    - Reproduce locally with `mcify dev` + the inspector. Switch to the
      Calls Log tab; click the failing call; the detail panel shows
      raw args, response, and stack trace.

When you've found the bug:

- Output a one-paragraph diagnosis.
- Show the diff (git-style: `-` removed, `+` added).
- Update the relevant test to cover the case so it can't regress.
- Don't speculate — only ship a change you can demonstrate fixes the
  bug under reproduction.
```

## How to use

Copy the prompt, replace the `<<<...>>>` block with the symptoms, paste into Claude Code or Cursor with the project open.

The 10-step checklist is ordered by frequency: schema mismatches account for ~60% of MCP tool bugs, auth is ~20%, the rest is descriptions/timing/side-effects. The model should land on the right diagnosis in steps 1–5 most of the time.

## Faster path: ask the inspector first

Before invoking this prompt, open the [calls log in the inspector](/concepts/tools/#anatomy). Click the failing call. The detail panel shows:

- **ARGS**: the exact args the agent sent.
- **RESULT**: the exact response (or the error and its `phase`).
- **DURATION**: useful for diagnosing timeouts.
- **STACK**: when the handler threw.

Most bugs visible to a human are visible in that panel without needing the full prompt.
