---
title: Your first MCP server
description: Add a real tool, see it in the inspector, ship it.
---

import { Steps } from '@astrojs/starlight/components';

You scaffolded with `mcify init` and ran `pnpm dev`. Now let's add a real tool that calls a real API.

We'll build a tiny server that wraps a public weather API. Two tools: `weather_get_current` and `weather_forecast`.

<Steps>

1. **Open `mcify.config.ts`.** It has one tool (`greet`). Delete it and the import.

2. **Create the input/output schemas.**

   ```ts title="src/schemas.ts"
   import { z } from 'zod';

   export const Coords = z.object({
     latitude: z.number().min(-90).max(90),
     longitude: z.number().min(-180).max(180),
   });

   export const CurrentWeather = z.object({
     temperatureC: z.number(),
     windKmh: z.number(),
     conditions: z.string(),
   });

   export const Forecast = z.object({
     daily: z.array(
       z.object({
         date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
         minC: z.number(),
         maxC: z.number(),
       }),
     ),
   });
   ```

3. **Write the tools.** Keep handlers small. Validate at the boundary, do the call, map the response.

   ```ts title="src/tools/get-current.ts"
   import { defineTool } from '@mcify/core';
   import { Coords, CurrentWeather } from '../schemas.js';

   export const getCurrent = defineTool({
     name: 'weather_get_current',
     description:
       'Current temperature, wind, and conditions for a coordinate. Use when the user asks for "weather right now" at a specific place.',
     input: Coords,
     output: CurrentWeather,
     handler: async ({ latitude, longitude }, ctx) => {
       const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
       const res = await ctx.fetch(url);
       const data = (await res.json()) as {
         current_weather: { temperature: number; windspeed: number; weathercode: number };
       };
       return {
         temperatureC: data.current_weather.temperature,
         windKmh: data.current_weather.windspeed,
         conditions: codeToWords(data.current_weather.weathercode),
       };
     },
   });

   const codeToWords = (code: number): string => {
     // Open-Meteo WMO codes — abridged for the example.
     if (code === 0) return 'clear';
     if (code <= 3) return 'partly cloudy';
     if (code <= 67) return 'rain';
     if (code <= 77) return 'snow';
     return 'storm';
   };
   ```

4. **Wire it into the config.**

   ```ts title="mcify.config.ts"
   import { defineConfig } from '@mcify/core';
   import { getCurrent } from './src/tools/get-current.js';

   export default defineConfig({
     name: 'weather',
     version: '0.1.0',
     description: 'Weather data via Open-Meteo, exposed as MCP tools.',
     tools: [getCurrent],
   });
   ```

5. **Run it.** `pnpm dev` is still watching. Save your files; the runtime hot-reloads.

   Hit the inspector at `http://localhost:3001`, switch to **Playground**, pick `weather_get_current`, paste:

   ```json
   { "latitude": -33.45, "longitude": -70.66 }
   ```

   Click **Invoke**. You get the current weather in Santiago.

</Steps>

## What just happened

- Your handler ran with **typed args** — `latitude` and `longitude` were already validated by Zod before your code saw them.
- The response was checked against `CurrentWeather` on the way out. If the upstream API ever returned a different shape, you'd see a `ValidationError` with the exact field that drifted, not a runtime crash three layers deep.
- The inspector observed everything via the runtime's event bus. Switch to the **Calls Log** tab to see the call, latency, args, and result.

## Add auth before you ship

Right now anyone who hits `http://localhost:8888/mcp` can call your tool. For real deploys, gate it with a bearer token:

```ts title="mcify.config.ts" {1, 8}
import { bearer, defineConfig } from '@mcify/core';
import { getCurrent } from './src/tools/get-current.js';

export default defineConfig({
  name: 'weather',
  version: '0.1.0',
  description: 'Weather data via Open-Meteo, exposed as MCP tools.',
  auth: bearer({ env: 'MCIFY_AUTH_TOKEN' }),
  tools: [getCurrent],
});
```

```bash
export MCIFY_AUTH_TOKEN="$(openssl rand -hex 32)"
pnpm dev
```

Now requests to `/mcp` need an `Authorization: Bearer <token>` header. The inspector still works because it goes through `/api/tools/...`, not `/mcp`.

## Next

- [Connect this to Claude / Cursor](/start/connect-clients/) — point a real agent at the server.
- [Concepts → Tools](/concepts/tools/) — the full anatomy of `defineTool`.
- [Creating effective tools](/guides/creating-effective-tools/) — what to put in the description, how to size schemas, when to add middleware.
