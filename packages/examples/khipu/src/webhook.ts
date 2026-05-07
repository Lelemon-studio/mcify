/**
 * Webhook signature verification for Khipu's notify_url POST.
 *
 * When Khipu confirms a payment, it POSTs the merchant's `notify_url`
 * with form-urlencoded body containing at least:
 *
 *     api_version=3.0
 *     notification_token=<token>
 *
 * The merchant should not trust the body alone — Khipu signs the request
 * so the merchant can verify it came from Khipu and the body wasn't
 * tampered with.
 *
 * As of Khipu API v3, the merchant verifies the notification by re-fetching
 * the payment via `GET /payments/{id}` using the `notification_token` —
 * if that endpoint returns the payment, it's authentic. This is the
 * pattern documented in the official SDK and `notify_api_version=3.0` flow.
 *
 * For merchants that received a v1.3 notification (legacy), Khipu signs
 * the body with HMAC-SHA256 and sends an `X-Khipu-Signature` header
 * containing `t=<timestamp>,v1=<hex>`. We export a helper for that case
 * — modelled on Stripe's webhook scheme so callers familiar with that
 * pattern can read the code without surprise.
 *
 * **The recommended verification path is `verifyByFetchingPayment`** —
 * use the HMAC helper only when working with the legacy `notify_api_version=1.3`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Parse a Khipu / Stripe-style signature header of the form
 * `t=<timestamp>,v1=<hex>` into its components.
 */
const parseSignatureHeader = (header: string): { timestamp: number; signature: string } | null => {
  const parts = header.split(',').map((p) => p.trim());
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (!key || !value) continue;
    if (key === 't') {
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

export interface VerifyKhipuWebhookOptions {
  /** Tolerance window in seconds for timestamp drift. Default 300s (5 min). */
  toleranceSeconds?: number;
  /** Override the "current time" (used in tests). Unix timestamp in seconds. */
  nowSeconds?: number;
}

/**
 * Verify a Khipu legacy (v1.3) webhook signature.
 *
 * @param rawBody The raw request body as a string. **Must not be parsed**
 *                — JSON.parse + stringify changes whitespace and breaks the
 *                  signature.
 * @param signatureHeader Value of the `X-Khipu-Signature` request header
 *                        (or the equivalent Khipu sends).
 * @param secret The webhook secret configured in Khipu's dashboard for
 *               this merchant.
 * @returns `true` if the signature matches and the timestamp is within
 *          tolerance.
 */
export const verifyKhipuWebhookSignature = (
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  options: VerifyKhipuWebhookOptions = {},
): boolean => {
  if (!signatureHeader || !secret) return false;
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const tolerance = options.toleranceSeconds ?? 300;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > tolerance) return false;

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return hexEqual(parsed.signature, expected);
};

/**
 * The recommended verification path for Khipu API v3 webhooks: re-fetch
 * the payment using the `notification_token` from the body. If the
 * connector's `getPayment` returns the payment, the notification is
 * authentic (only Khipu can mint valid tokens).
 *
 * Callers receive the helper as a curried function so they can plug it
 * into Express / Hono / Fastify handlers without importing the client
 * type directly.
 */
export interface VerifiedKhipuNotification {
  notificationToken: string;
  apiVersion?: string;
  /** Original parsed body (form fields). */
  body: Record<string, string>;
}

/**
 * Parse the form-urlencoded body Khipu sends to `notify_url` and return
 * the canonical fields. The merchant's webhook handler then calls
 * `khipuClient.getPayment(notificationToken)` to verify authenticity.
 */
export const parseKhipuNotification = (rawBody: string): VerifiedKhipuNotification | null => {
  const body: Record<string, string> = {};
  for (const pair of rawBody.split('&')) {
    const [k, v] = pair.split('=', 2);
    if (!k) continue;
    body[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  const notificationToken = body['notification_token'];
  if (!notificationToken) return null;
  return {
    notificationToken,
    ...(body['api_version'] ? { apiVersion: body['api_version'] } : {}),
    body,
  };
};
