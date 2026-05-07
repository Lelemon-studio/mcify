import path from 'node:path';
import process from 'node:process';
import { bearer, defineConfig } from '@mcify/core';
import { JsonFileSimpleFacturaSessionStore } from './src/sessions.js';
import { createSimpleFacturaCheckFoliosTool } from './src/tools/check-folios.js';
import { createSimpleFacturaEmitCreditNoteTool } from './src/tools/emit-credit-note.js';
import { createSimpleFacturaEmitDteTool } from './src/tools/emit-dte.js';
import { createSimpleFacturaGetClientByRutTool } from './src/tools/get-client-by-rut.js';
import { createSimpleFacturaGetCompanyInfoTool } from './src/tools/get-company-info.js';
import { createSimpleFacturaGetDocumentTool } from './src/tools/get-document.js';
import { createSimpleFacturaListBheIssuedTool } from './src/tools/list-bhe-issued.js';
import { createSimpleFacturaListBheReceivedTool } from './src/tools/list-bhe-received.js';
import { createSimpleFacturaListBranchOfficesTool } from './src/tools/list-branch-offices.js';
import { createSimpleFacturaListClientsTool } from './src/tools/list-clients.js';
import { createSimpleFacturaListDocumentsTool } from './src/tools/list-documents.js';
import { createSimpleFacturaListProductsTool } from './src/tools/list-products.js';
import { createSimpleFacturaListReceivedDocumentsTool } from './src/tools/list-received-documents.js';

// Multi-tenant SimpleFactura connector. ONE deploy, MANY orgs, MANY empresas per org.
//
// SimpleFactura's quirk: a single user account (email + password) can
// operate many companies. The connector models this with a two-level
// lookup:
//
//   bearer token  →  SimpleFactura email + password (one cuenta)
//                 →  empresas: { userKey → { rutEmisor, rutContribuyente, ... } }
//
// Onboarding (per org):
//   1. The org provides their SimpleFactura email + password.
//   2. Generate a bearer token (`openssl rand -hex 32` or skip — CLI generates one).
//   3. Register the org binding:
//        pnpm admin add-org acme demo@chilesystems.com Rv8Il4eV
//   4. For each empresa the org operates, register its `rutEmisor`:
//        pnpm admin add-empresa <bearer> default 76.000.000-0
//   5. Optionally pin a default empresa:
//        pnpm admin set-default <bearer> default
//   6. The org pastes the bearer in their Claude Desktop / Cursor config.
//
// At request time the bearer resolves to a session, the userKey selects
// the empresa (or the default), and the agent NEVER sees the underlying
// email/password/JWT.

const sessionsPath =
  process.env['SIMPLEFACTURA_SESSIONS_PATH'] ?? path.resolve(process.cwd(), 'sessions.json');
const sessions = new JsonFileSimpleFacturaSessionStore(sessionsPath);

export default defineConfig({
  name: 'simplefactura',
  version: '0.1.0',
  description:
    'SimpleFactura (Chile) — multi-tenant electronic invoicing MCP server. ' +
    'DTE emission (factura, boleta, NC/ND), boletas de honorarios, document ' +
    'lookup, folios. One deploy serves many orgs and many empresas per org.',
  auth: bearer({
    env: 'SIMPLEFACTURA_BEARER_ENV_UNUSED',
    verify: async (token) => {
      const session = await sessions.resolveBearer(token);
      return session !== null;
    },
  }),
  tools: [
    createSimpleFacturaEmitDteTool(sessions),
    createSimpleFacturaEmitCreditNoteTool(sessions),
    createSimpleFacturaListDocumentsTool(sessions),
    createSimpleFacturaGetDocumentTool(sessions),
    createSimpleFacturaListClientsTool(sessions),
    createSimpleFacturaGetClientByRutTool(sessions),
    createSimpleFacturaListProductsTool(sessions),
    createSimpleFacturaListBranchOfficesTool(sessions),
    createSimpleFacturaListBheIssuedTool(sessions),
    createSimpleFacturaListBheReceivedTool(sessions),
    createSimpleFacturaCheckFoliosTool(sessions),
    createSimpleFacturaListReceivedDocumentsTool(sessions),
    createSimpleFacturaGetCompanyInfoTool(sessions),
  ],
});
