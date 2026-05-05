import { runDeployCloudflare } from '../deploy/cloudflare.js';
import { runDeployDocker } from '../deploy/docker.js';
import { runDeployVercel } from '../deploy/vercel.js';
import { runDeployFly } from '../deploy/fly.js';
import { runDeployRailway } from '../deploy/railway.js';
import { log } from '../logger.js';
import { type ParsedArgs } from '../args.js';

const DEPLOY_TARGETS = {
  cloudflare: runDeployCloudflare,
  workers: runDeployCloudflare, // alias
  docker: runDeployDocker,
  vercel: runDeployVercel,
  fly: runDeployFly,
  railway: runDeployRailway,
} as const;

const HELP = `
mcify deploy <target> [options]

Targets:
  cloudflare (alias: workers)   Deploy to Cloudflare Workers via wrangler
  vercel                        Deploy to Vercel Edge Functions via vercel CLI
  fly                           Deploy to Fly.io via flyctl
  railway                       Deploy to Railway via railway CLI
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

fly-specific:
  --app <name>         Fly app name (default: config.name)
  --region <code>      Primary region (default: scl)
  --port <number>      Internal port the app listens on (default: 8888)
  --launch             Run \`flyctl launch\` first-time setup instead of deploy

railway-specific:
  --service <name>     Specific service inside the Railway project
  --environment <env>  Target environment (default: production)
  --port <number>      App port (default: 8888)

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
    process.exit(1);
  }

  await handler(args);
};
