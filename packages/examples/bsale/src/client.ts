/**
 * Minimal Bsale API client for DTE / facturación electrónica chilena.
 *
 * Verified against the official docs at https://docs.bsale.dev (May 2026):
 *  - Base URL:        https://api.bsale.io/v1
 *  - Auth header:     `access_token: <TOKEN>` (literal, no Bearer prefix)
 *  - Endpoints:       /documents.json, /documents/{id}.json, /clients.json
 *  - Date format:     integer unix timestamps (GMT, no timezone applied)
 *  - taxId format:    string with bracketed CSV — "[1,2]"
 *  - Document state:  raw `state` is 0=active / 1=inactive (NOT a SII status)
 *  - SII status:      raw `informedSii` is 0=correct / 1=sent / 2=rejected
 *  - Response shape:  paginated lists return { href, count, limit, offset, items }
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
  /**
   * Issue date (YYYY-MM-DD). The client converts it to the unix timestamp
   * (seconds, GMT — Bsale explicitly says no timezone applied). Bsale
   * defaults to today if omitted.
   */
  emissionDate?: string;
  /** Optional expiration date (YYYY-MM-DD), useful for cotizaciones / quotes. */
  expirationDate?: string;
  /** Office id when the merchant has more than one. Required in multi-office accounts. */
  officeId?: number;
  /** Price list id, optional. */
  priceListId?: number;
  /** Whether to declare to SII immediately (1) or keep as a draft (0). Defaults to 1 server-side. */
  declareSii?: 0 | 1;
  /** Free-form external reference id; useful for idempotency tracking. */
  salesId?: string;
  /** Document line items. At least one required. */
  details: {
    /** Bsale variant id — required when the line refers to a tracked SKU. */
    variantId?: number;
    /** Net unit price (CLP, no tax). */
    netUnitValue: number;
    /** Number of units. */
    quantity: number;
    /** Free-text line description. Bsale calls this `comment`. */
    description?: string;
    /** Optional discount percentage (0–100). */
    discount?: number;
    /** Optional tax ids to apply per line. The client serializes as Bsale's "[1,2]" string format. */
    taxId?: number[];
  }[];
  /** Existing client id (use bsale_list_clients to find one). Use this OR `client`, not both. */
  clientId?: number;
  /** Inline client. Bsale will create or match by RUT (`code`). */
  client?: {
    /** RUT, formatted "11.111.111-1" — Bsale requires the dotted form. */
    code: string;
    company?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    address?: string;
    municipality?: string;
    city?: string;
    /** Giro tributario. */
    activity?: string;
    /** 0 = persona, 1 = empresa. */
    companyOrPerson?: 0 | 1;
  };
}

/** Lifecycle state of a Bsale document. Returned as `state` (0=active, 1=inactive). */
export type DocumentLifecycle = 'active' | 'inactive';

/**
 * SII declaration status of a Bsale document. Returned as `informedSii`
 * (0=correct, 1=sent, 2=rejected). 'unknown' covers undefined / out-of-range.
 */
export type SiiStatus = 'correct' | 'sent' | 'rejected' | 'unknown';

export interface DteRecord {
  id: number;
  number: number;
  /** Issue date as YYYY-MM-DD (parsed from Bsale's unix timestamp in GMT). */
  emissionDate: string;
  totalAmount: number;
  netAmount?: number;
  taxAmount?: number;
  documentTypeId: number;
  /** Bsale's `state` field. 0=active, 1=inactive. */
  lifecycle: DocumentLifecycle;
  /** Bsale's `informedSii` field. The actual SII declaration status. */
  siiStatus: SiiStatus;
  /** Server-rendered PDF (authenticated). */
  urlPdf?: string;
  /** Public-facing read-only view of the document. */
  urlPublicView?: string;
  /** XML representation (the SII document). */
  urlXml?: string;
}

export interface ListInvoicesParams {
  limit?: number;
  offset?: number;
  /** Inclusive lower bound on emission date, YYYY-MM-DD. */
  emissionDateFrom?: string;
  /** Inclusive upper bound on emission date, YYYY-MM-DD. */
  emissionDateTo?: string;
  documentTypeId?: number;
  /** Filter by SII code (e.g. 33 for factura electrónica). */
  codeSii?: number;
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
  /** Unix timestamp (seconds, GMT). */
  emissionDate: number;
  totalAmount: number;
  netAmount?: number;
  taxAmount?: number;
  document_type?: { id: number; href?: string };
  /** 0 = active, 1 = inactive. */
  state?: number;
  /** 0 = correct, 1 = sent, 2 = rejected. */
  informedSii?: number;
  urlPdf?: string;
  urlPublicView?: string;
  urlXml?: string | null;
}

interface BsaleClientRaw {
  id: number;
  code: string;
  company?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

/** Convert a YYYY-MM-DD string to a unix timestamp in seconds (UTC midnight). */
const dateToUnixGmt = (yyyymmdd: string): number => {
  // Bsale: "no se debe aplicar zona horaria, solo considerar la fecha".
  // Build the timestamp as UTC midnight from the y/m/d parts so the host's
  // local timezone doesn't shift the day.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) throw new TypeError(`Invalid date format (expected YYYY-MM-DD): ${yyyymmdd}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000;
};

/** Convert a unix timestamp (seconds, GMT) back to YYYY-MM-DD. */
const unixGmtToDate = (seconds: number): string => {
  const d = new Date(seconds * 1000);
  // Use UTC getters so a Bsale-emitted date in GMT doesn't drift to the
  // previous/next day depending on the host's timezone.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const lifecycleFromState = (state?: number): DocumentLifecycle =>
  state === 1 ? 'inactive' : 'active';

const siiStatusFrom = (informedSii?: number): SiiStatus => {
  if (informedSii === 0) return 'correct';
  if (informedSii === 1) return 'sent';
  if (informedSii === 2) return 'rejected';
  return 'unknown';
};

const toDte = (raw: BsaleDocumentRaw): DteRecord => ({
  id: raw.id,
  number: raw.number,
  emissionDate: unixGmtToDate(raw.emissionDate),
  totalAmount: raw.totalAmount,
  ...(typeof raw.netAmount === 'number' ? { netAmount: raw.netAmount } : {}),
  ...(typeof raw.taxAmount === 'number' ? { taxAmount: raw.taxAmount } : {}),
  documentTypeId: raw.document_type?.id ?? 0,
  lifecycle: lifecycleFromState(raw.state),
  siiStatus: siiStatusFrom(raw.informedSii),
  ...(raw.urlPdf ? { urlPdf: raw.urlPdf } : {}),
  ...(raw.urlPublicView ? { urlPublicView: raw.urlPublicView } : {}),
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
        ...(typeof d.discount === 'number' ? { discount: d.discount } : {}),
        // Bsale's quirk: taxId is a STRING with bracketed CSV, not an array.
        ...(d.taxId ? { taxId: `[${d.taxId.join(',')}]` } : {}),
      })),
    };
    if (input.emissionDate) body['emissionDate'] = dateToUnixGmt(input.emissionDate);
    if (input.expirationDate) body['expirationDate'] = dateToUnixGmt(input.expirationDate);
    if (input.officeId) body['officeId'] = input.officeId;
    if (input.priceListId) body['priceListId'] = input.priceListId;
    if (input.declareSii !== undefined) body['declareSii'] = input.declareSii;
    if (input.salesId) body['salesId'] = input.salesId;
    if (input.clientId) body['clientId'] = input.clientId;
    if (input.client) body['client'] = input.client;

    const raw = (await this.request('POST', '/documents.json', body)) as BsaleDocumentRaw;
    return toDte(raw);
  }

  async listInvoices(params: ListInvoicesParams = {}): Promise<DteRecord[]> {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.offset) search.set('offset', String(params.offset));
    // Bsale takes `emissiondaterange=[from,to]` with unix timestamps, NOT
    // separate `emissiondatefrom` / `emissiondateto` params.
    if (params.emissionDateFrom || params.emissionDateTo) {
      const from = params.emissionDateFrom ? dateToUnixGmt(params.emissionDateFrom) : 0;
      const to = params.emissionDateTo
        ? dateToUnixGmt(params.emissionDateTo)
        : Math.floor(Date.now() / 1000);
      search.set('emissiondaterange', `[${from},${to}]`);
    }
    if (params.documentTypeId) search.set('documenttypeid', String(params.documentTypeId));
    if (params.codeSii) search.set('codesii', String(params.codeSii));

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
        // Bsale's auth: literal `access_token` header, no Bearer prefix.
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
