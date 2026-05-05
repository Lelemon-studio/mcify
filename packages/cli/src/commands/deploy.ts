import { runDeployCloudflare } from '../deploy/cloudflare.js';
import { runDeployDocker } from '../deploy/docker.js';
import { runDeployVercel } from '../deploy/vercel.js';
import { log } from '../logger.js';
import { type ParsedArgs } from '../args.js';

const DEPLOY_TARGETS = {
  cloudflare: runDeployCloudflare,
  workers: runDeployCloudflare, // alias
  docker: runDeployDocker,
  vercel: runDeployVercel,
} as const;

const HELP = `
mcify deploy <target> [options]

Targets:
  cloudflare (alias: workers)   Deploy to Cloudflare Workers via wrangler
  vercel                        Deploy to Vercel Edge Functions via vercel CLI
  docker                        Build a multi-stage Docker image (optionally push)

Common options:
  --config <path>      Path to mcify.config.ts (default: ./mcify.config.ts)
  --dry-run            Generate config + bundle but don't actually deploy

cloudflare-specific:
  --project-name <n>   Worker name (default: config.name)
  --account-id <id>    Cloudflare account id (or set CLOUDFLARE_ACCOUNT_ID)
  --compatibility-date <d>   Workers compatibility date (default: 2026-01-01)

vercel-specific:
  --prod               Promote to production (default: preview deployment)
  --project <n>        Vercel project name

docker-specific:
  --tag <image:tag>    Image tag (default: mcify-server:latest)
  --platform <plat>    Build platform (e.g. linux/amd64,linux/arm64)
  --port <number>      EXPOSEd port (default: 8888)
  --push               docker push after build
`.trim();

export const runDeploy = async (args: ParsedArgs): Promise<void> => {
  const target = args.positional[1];

  if (!target || args.flags['help'] || args.flags['h']) {
    process.stdout.write(`${HELP}\n`);
    if (!target) process.exit(1);
    return;
  }

  const handler = (DEPLOY_TARGETS as Record<string, (a: ParsedArgs) => Promise<void>>)[target];
  if (!handler) {
    log.error(`Unknown deploy target: ${target}`);
    log.hint(`Available: ${Object.keys(DEPLOY_TARGETS).join(', ')}`);
    log.hint('Fly.io and Railway arrive in a follow-up release.');
    process.exit(1);
  }

  await handler(args);
};
