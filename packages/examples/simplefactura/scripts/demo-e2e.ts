/**
 * E2E smoke test against the public SimpleFactura demo account.
 *
 *   pnpm exec tsx scripts/demo-e2e.ts
 *
 * Hits live api.simplefactura.cl with `demo@chilesystems.com` /
 * `Rv8Il4eV` (their own published demo creds). Reports which calls
 * succeed and which surface drift vs what the SDK suggested.
 *
 * Read-only by default. Pass --emit to also try a sandbox emission
 * in ambiente=Certificación with a tiny test document.
 */

import process from 'node:process';
import { SimpleFacturaApiError, SimpleFacturaClient } from '../src/client.js';

const DEMO_EMAIL = 'demo@chilesystems.com';
const DEMO_PASSWORD = 'Rv8Il4eV';
// Demo company RUT (extracted from the official SDK test fixtures
// at github.com/lpinedozav/SDKSimpleFactura/SDKSimpleFacturaTests).
const DEMO_RUT_EMISOR = '76269769-6';
const DEMO_RUT_CONTRIBUYENTE = '26429782-6';

const args = new Set(process.argv.slice(2));
const tryEmit = args.has('--emit');

type Outcome =
  | { kind: 'ok'; label: string; payloadPreview: unknown }
  | { kind: 'fail'; label: string; status: number; message: string; body: unknown };

const outcomes: Outcome[] = [];

const safeStringify = (value: unknown, maxChars = 800): string => {
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > maxChars ? json.slice(0, maxChars) + '\n…(truncated)' : json;
  } catch {
    return String(value);
  }
};

const run = async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
  process.stdout.write(`▶ ${label}\n`);
  try {
    const result = await fn();
    outcomes.push({ kind: 'ok', label, payloadPreview: result });
    process.stdout.write('  ✓ ok\n');
    return result;
  } catch (e) {
    if (e instanceof SimpleFacturaApiError) {
      outcomes.push({
        kind: 'fail',
        label,
        status: e.status,
        message: e.message,
        body: e.body,
      });
      process.stdout.write(`  ✗ ${e.status} — ${e.message}\n`);
      process.stdout.write(`    body: ${safeStringify(e.body, 400)}\n`);
    } else {
      const err = e as Error;
      outcomes.push({
        kind: 'fail',
        label,
        status: 0,
        message: err.message ?? String(e),
        body: null,
      });
      process.stdout.write(`  ✗ throw — ${err.message ?? String(e)}\n`);
    }
    return undefined;
  }
};

const main = async (): Promise<void> => {
  const client = new SimpleFacturaClient({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  const credenciales = {
    EmailUsuario: DEMO_EMAIL,
    RutEmisor: DEMO_RUT_EMISOR,
    RutContribuyente: DEMO_RUT_CONTRIBUYENTE,
    NombreSucursal: 'Casa Matriz',
  };

  // 1. Auth + datos empresa together (auth happens implicitly).
  await run('datos empresa — POST /datosEmpresa', async () => {
    return await client.post<unknown, Record<string, unknown>>('/datosEmpresa', credenciales);
  });

  const cached = client.getCachedToken();
  if (!cached) {
    process.stderr.write('No token cached after auth — aborting.\n');
    process.exit(1);
  }
  process.stdout.write(`  expiresAt: ${cached.expiresAt}\n`);

  // 3. Read-only probes
  await run('list branch offices — POST /branchOffices', async () => {
    return await client.post('/branchOffices', credenciales);
  });

  await run('list clients — POST /clients', async () => {
    return await client.post('/clients', credenciales);
  });

  await run('list products — POST /products', async () => {
    return await client.post('/products', credenciales);
  });

  await run('list documents (last 90 days) — POST /documentsIssued', async () => {
    const today = new Date();
    const ninety = new Date(today);
    ninety.setDate(today.getDate() - 90);
    return await client.post('/documentsIssued', {
      Credenciales: credenciales,
      Ambiente: 0, // Certificación
      Desde: ninety.toISOString().slice(0, 10),
      Hasta: today.toISOString().slice(0, 10),
      Salida: 0,
    });
  });

  await run('check folios disponibles (boleta 39, cert)', async () => {
    return await client.post('/folios/consultar/disponibles', {
      RutEmpresa: DEMO_RUT_EMISOR,
      TipoDTE: 39,
      Ambiente: 0,
    });
  });

  // 4. Optional: real emit in Certificación.
  if (tryEmit) {
    await run('emit boleta cert — POST /invoiceV2/casa-matriz', async () => {
      const today = new Date().toISOString().slice(0, 10);
      return await client.post('/invoiceV2/casa-matriz', {
        Documento: {
          Encabezado: {
            IdDoc: { TipoDTE: 39, FchEmis: today, IndServicio: 3 },
            Emisor: { RUTEmisor: DEMO_RUT_EMISOR },
            Receptor: { RUTRecep: '66666666-6', RznSocRecep: 'Cliente Final Demo' },
            Totales: { MntNeto: 1000, MntExe: 0, IVA: 190, MntTotal: 1190 },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto demo E2E',
              QtyItem: 1,
              PrcItem: 1000,
              MontoItem: 1000,
            },
          ],
        },
      });
    });
  }

  // 5. Summary
  process.stdout.write('\n' + '='.repeat(60) + '\n');
  const ok = outcomes.filter((o) => o.kind === 'ok').length;
  const fail = outcomes.filter((o) => o.kind === 'fail').length;
  process.stdout.write(`Summary: ${ok} ok, ${fail} fail\n`);

  for (const o of outcomes) {
    if (o.kind === 'fail') {
      process.stdout.write(`\n--- FAIL: ${o.label}\n`);
      process.stdout.write(`    status=${o.status}  message=${o.message}\n`);
      process.stdout.write(`    body: ${safeStringify(o.body, 500)}\n`);
    }
  }

  process.exit(fail === 0 ? 0 : 1);
};

main().catch((e) => {
  process.stderr.write(`unhandled: ${(e as Error).message}\n`);
  process.exit(1);
});
