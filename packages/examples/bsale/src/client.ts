/**
 * Minimal Bsale API client for DTE / facturación electrónica chilena.
 *
 * API reference: https://docs.bsale.io
 *
 * Auth is a single header `access_token` issued from the merchant
 * dashboard (Configuración → API → "Crear Token"). Bsale's full API
 * surfaces hundreds of endpoints — this client covers only what the
 * MCP example tools need.
 */

const DEFAULT_BASE_URL = 'https://api.bsale.io/v1';

export interface BsaleClientOptions {
  /** Bsale `access_token` from the merchant dashboard. */
  accessToken: string;
  /** Override the API base URL. Defaults to https://api.bsale.io/v1. */
  baseUrl?: string;
  /** Inject a fetch implementation. Tests pass a mock here. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Bsale "tipo de documento" / SII document code. Common values:
 * - 33: Factura electrónica
 * - 34: Factura exenta electrónica
 * - 39: Boleta electrónica
 * - 41: Boleta exenta electrónica
 * - 56: Nota de débito electrónica
 * - 61: Nota de crédito electrónica
 * Bsale exposes the full list at GET /v1/document_types.json — surfacing
 * a numeric `documentTypeId` keeps the schema tight without enumerating
 * every variant up-front.
 */
export interface EmitDteInput {
  /** Bsale internal document type id. See `document_types.json`. */
  documentTypeId: number;
  /** Issue date (YYYY-MM-DD) — Bsale defaults to today if omitted. */
  emissionDate?: string;
  /** Net amount per line. The connector forwards as `details[]`. */
  details: {
    netUnitValue: number;
    quantity: number;
    description?: string;
    /** Bsale variant id — used for products tracked in their inventory. */
    variantId?: number;
    taxId?: number[];
  }[];
  /** Existing client id (use bsale_list_clients to find one). */
  clientId?: number;
  /** Inline client — Bsale will create or match by RUT. */
  client?: {
    code: string; // RUT, format "11.111.111-1"
    company?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    address?: string;
    municipality?: string;
    city?: string;
    activity?: string;
  };
}

export interface DteRecord {
  id: number;
  number: number;
  emissionDate: string;
  totalAmount: number;
  documentTypeId: number;
  status: 'accepted' | 'rejected' | 'pending' | 'unknown';
  urlPdf?: string;
  urlXml?: string;
}

export interface ListInvoicesParams {
  limit?: number;
  offset?: number;
  /** Bsale field; ISO date YYYY-MM-DD */
  emissionDateFrom?: string;
  emissionDateTo?: string;
  documentTypeId?: number;
}

export interface ClientRecord {
  id: number;
  code: string;
  company?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export class BsaleApiError extends Error {
  override readonly name = 'BsaleApiError';
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

interface BsaleListEnvelope<T> {
  href: string;
  count: number;
  limit: number;
  offset: number;
  items: T[];
}

interface BsaleDocumentRaw {
  id: number;
  number: number;
  emissionDate: number; // unix seconds
  totalAmount: number;
  document_type?: { id: number };
  state?: number;
  urlPdf?: string;
  urlPublicPdf?: string;
  urlXml?: string;
}

interface BsaleClientRaw {
  id: number;
  code: string;
  company?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

const toDte = (raw: BsaleDocumentRaw): DteRecord => ({
  id: raw.id,
  number: raw.number,
  // Bsale returns emissionDate as a unix timestamp (seconds) when reading.
  // Normalize to ISO yyyy-mm-dd for predictability across tools.
  emissionDate: new Date(raw.emissionDate * 1000).toISOString().slice(0, 10),
  totalAmount: raw.totalAmount,
  documentTypeId: raw.document_type?.id ?? 0,
  status:
    raw.state === 0
      ? 'accepted'
      : raw.state === 2
        ? 'rejected'
        : raw.state === 1
          ? 'pending'
          : 'unknown',
  ...(raw.urlPublicPdf ? { urlPdf: raw.urlPublicPdf } : raw.urlPdf ? { urlPdf: raw.urlPdf } : {}),
  ...(raw.urlXml ? { urlXml: raw.urlXml } : {}),
});

const toClient = (raw: BsaleClientRaw): ClientRecord => ({
  id: raw.id,
  code: raw.code,
  ...(raw.company ? { company: raw.company } : {}),
  ...(raw.firstName ? { firstName: raw.firstName } : {}),
  ...(raw.lastName ? { lastName: raw.lastName } : {}),
  ...(raw.email ? { email: raw.email } : {}),
});

export class BsaleClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: BsaleClientOptions) {
    if (!options.accessToken) {
      throw new TypeError('BsaleClient: `accessToken` is required');
    }
    this.accessToken = options.accessToken;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async emitDte(input: EmitDteInput): Promise<DteRecord> {
    const body: Record<string, unknown> = {
      documentTypeId: input.documentTypeId,
      details: input.details.map((d) => ({
        netUnitValue: d.netUnitValue,
        quantity: d.quantity,
        ...(d.description ? { comment: d.description } : {}),
        ...(d.variantId ? { variantId: d.variantId } : {}),
        ...(d.taxId ? { taxId: `[${d.taxId.join(',')}]` } : {}),
      })),
    };
    if (input.emissionDate) body['emissionDate'] = input.emissionDate;
    if (input.clientId) body['clientId'] = input.clientId;
    if (input.client) body['client'] = input.client;

    const raw = (await this.request('POST', '/documents.json', body)) as BsaleDocumentRaw;
    return toDte(raw);
  }

  async listInvoices(params: ListInvoicesParams = {}): Promise<DteRecord[]> {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.offset) search.set('offset', String(params.offset));
    if (params.emissionDateFrom) search.set('emissiondatefrom', params.emissionDateFrom);
    if (params.emissionDateTo) search.set('emissiondateto', params.emissionDateTo);
    if (params.documentTypeId) search.set('documenttypeid', String(params.documentTypeId));

    const path = `/documents.json${search.size ? `?${search.toString()}` : ''}`;
    const envelope = (await this.request('GET', path)) as BsaleListEnvelope<BsaleDocumentRaw>;
    return envelope.items.map(toDte);
  }

  async getInvoice(id: number): Promise<DteRecord> {
    const raw = (await this.request('GET', `/documents/${id}.json`)) as BsaleDocumentRaw;
    return toDte(raw);
  }

  async listClients(query?: string): Promise<ClientRecord[]> {
    // Bsale supports filtering by `code` (RUT) or `email`. We expose a
    // free-form `query` and decide which field to send based on shape:
    // anything containing '@' goes to `email`, otherwise `code`.
    const search = new URLSearchParams({ limit: '50' });
    if (query) search.set(query.includes('@') ? 'email' : 'code', query);
    const envelope = (await this.request(
      'GET',
      `/clients.json?${search.toString()}`,
    )) as BsaleListEnvelope<BsaleClientRaw>;
    return envelope.items.map(toClient);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        access_token: this.accessToken,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    const response = await this.fetchImpl(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Bsale returns JSON for valid responses; keep the raw body for debug.
        parsed = text;
      }
    }

    if (!response.ok) {
      const message =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : `Bsale request failed: ${response.status}`;
      throw new BsaleApiError(message, response.status, parsed);
    }

    return parsed;
  }
}
