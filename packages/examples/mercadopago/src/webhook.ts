/**
 * Webhook signature verification for Mercado Pago notifications.
 *
 * MP sends webhooks to the merchant's `notification_url` for events
 * like `payment.created`, `payment.updated`, etc. Each request carries:
 *
 *     x-signature: ts=<unix-ts>,v1=<hex-hmac-sha256>
 *     x-request-id: <uuid>
 *
 * The signed payload is built from a template that includes the
 * `data.id` from the webhook query/body, the request id, and the
 * timestamp:
 *
 *     id:<dataId>;request-id:<requestId>;ts:<ts>;
 *
 * The merchant verifies by HMAC-SHA256 of that template with their
 * webhook secret (configured in the dashboard for each integration).
 *
 * Reference: https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

interface ParsedSignature {
  timestamp: number;
  signature: string;
}

const parseSignatureHeader = (header: string): ParsedSignature | null => {
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of header.split(',').map((p) => p.trim())) {
    const [key, value] = part.split('=', 2);
    if (!key || !value) continue;
    if (key === 'ts') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === 'v1') {
      signature = value;
    }
  }
  if (timestamp === null || !signature) return null;
  return { timestamp, signature };
};

const hexEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
};

export interface VerifyMercadoPagoWebhookOptions {
  /** Tolerance window in seconds for timestamp drift. Default 300s. */
  toleranceSeconds?: number;
  /** Override "now" (used in tests). Unix timestamp in seconds. */
  nowSeconds?: number;
}

export interface VerifyMercadoPagoWebhookInput {
  /** `data.id` from the webhook body or query (the resource id). */
  dataId: string;
  /** `x-request-id` header value. */
  requestId: string;
  /** `x-signature` header value (full string with `ts=...,v1=...`). */
  signatureHeader: string | null | undefined;
  /** Webhook secret from the MP dashboard. */
  secret: string;
}

/**
 * Verify a Mercado Pago webhook signature.
 */
export const verifyMercadoPagoWebhookSignature = (
  input: VerifyMercadoPagoWebhookInput,
  options: VerifyMercadoPagoWebhookOptions = {},
): boolean => {
  if (!input.signatureHeader || !input.secret || !input.dataId || !input.requestId) {
    return false;
  }
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed) return false;

  const tolerance = options.toleranceSeconds ?? 300;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > tolerance) return false;

  const template = `id:${input.dataId};request-id:${input.requestId};ts:${parsed.timestamp};`;
  const expected = createHmac('sha256', input.secret).update(template).digest('hex');
  return hexEqual(parsed.signature, expected);
};
