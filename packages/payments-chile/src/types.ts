/**
 * Vendor-agnostic types for Chilean payment links.
 *
 * Designed to be portable across the local payment-link ecosystem:
 * Khipu, Mercado Pago, Webpay/Transbank, Smart Checkout (Fintoc).
 * Each connector maps from `PaymentLinkInput` to its native payload,
 * so the LLM-facing schema is identical regardless of which vendor
 * backs the org.
 *
 * The status enum collapses each vendor's native lifecycle into a
 * stable six-state canon — see {@link PaymentLinkStatus}.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------
// Status — the canonical six-state lifecycle.
// ---------------------------------------------------------------------

/**
 * Portable payment-link status. Maps from each vendor's native states
 * to a stable six-state lifecycle the agent can reason about uniformly.
 *
 * - `pending`: created but not yet paid.
 * - `paid`: customer paid; merchant received the funds (or will after settlement).
 * - `expired`: link reached its expiration without being paid.
 * - `cancelled`: merchant cancelled the link before payment.
 * - `failed`: payment attempt failed (declined, insufficient funds, anti-fraud, etc.).
 * - `refunded`: was paid but funds were returned to the customer.
 */
export const paymentLinkStatusSchema = z.enum([
  'pending',
  'paid',
  'expired',
  'cancelled',
  'failed',
  'refunded',
]);
export type PaymentLinkStatus = z.infer<typeof paymentLinkStatusSchema>;

// ---------------------------------------------------------------------
// Customer (payer) info.
// ---------------------------------------------------------------------

export const paymentCustomerSchema = z.object({
  name: z.string().max(120).optional(),
  email: z.string().email().optional(),
  rut: z
    .string()
    .max(20)
    .optional()
    .describe('RUT of the payer if known (Chile-specific identifier).'),
});
export type PaymentCustomer = z.infer<typeof paymentCustomerSchema>;

// ---------------------------------------------------------------------
// Input — what the agent passes to create a payment link.
// ---------------------------------------------------------------------

/**
 * Vendor-specific advanced fields. Each connector extends this with its
 * own namespace to expose vendor-specific knobs without polluting the
 * common shape. Keep usage rare — the schema is portable for a reason.
 *
 * Example:
 *   {
 *     khipu: { bankId: 'cl_banco_estado', sendEmail: true },
 *     mercadopago: { excludedPaymentTypes: ['ticket'], installments: 3 },
 *   }
 */
export const paymentVendorSchema = z.record(z.unknown()).optional();
export type PaymentVendorOptions = z.infer<typeof paymentVendorSchema>;

export const paymentLinkInputBaseSchema = z.object({
  subject: z
    .string()
    .min(1)
    .max(255)
    .describe('Short description shown to the payer (e.g. "Cobro pedido #1234").'),
  amount: z
    .number()
    .positive()
    .describe('Amount in the major unit of the currency (CLP whole pesos, USD dollars).'),
  currency: z.enum(['CLP', 'USD']).describe('ISO 4217 currency code.'),
  customer: paymentCustomerSchema
    .optional()
    .describe('Payer info. Helps the vendor pre-fill the payment form.'),
  externalId: z
    .string()
    .max(64)
    .optional()
    .describe(
      'Merchant-side identifier for this payment. Echoed back on webhooks so the merchant can correlate.',
    ),
  description: z.string().max(1000).optional().describe('Longer description shown on receipts.'),
  successUrl: z
    .string()
    .url()
    .optional()
    .describe('Where the payer is redirected after a successful payment.'),
  cancelUrl: z.string().url().optional().describe('Where the payer is redirected if they cancel.'),
  notifyUrl: z
    .string()
    .url()
    .optional()
    .describe('Webhook URL the vendor will POST status updates to.'),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/)
    .optional()
    .describe('ISO 8601 timestamp after which the link expires.'),
});
export type PaymentLinkInputBase = z.infer<typeof paymentLinkInputBaseSchema>;

// ---------------------------------------------------------------------
// Result — what the connector returns after creating / fetching a link.
// ---------------------------------------------------------------------

export const paymentLinkResultBaseSchema = z.object({
  paymentId: z.string().describe('Vendor-issued unique identifier for the payment.'),
  paymentUrl: z
    .string()
    .url()
    .describe('Primary URL to share with the payer. Opens the vendor checkout.'),
  status: paymentLinkStatusSchema,
  amount: z.number(),
  currency: z.string(),
  subject: z.string(),
  externalId: z.string().optional(),
  expiresAt: z.string().optional(),
  paidAt: z
    .string()
    .optional()
    .describe('ISO 8601 timestamp of when the payment settled, when known.'),
  receiptUrl: z.string().url().optional(),
});
export type PaymentLinkResultBase = z.infer<typeof paymentLinkResultBaseSchema>;

// ---------------------------------------------------------------------
// Refunds.
// ---------------------------------------------------------------------

export const refundInputSchema = z.object({
  paymentId: z.string().min(1).describe('Identifier of the payment / link to refund.'),
  amount: z
    .number()
    .positive()
    .optional()
    .describe(
      'Amount to refund. Omit for a full refund. Vendor must support partial refunds; some only support full.',
    ),
});
export type RefundInput = z.infer<typeof refundInputSchema>;

export const refundResultSchema = z.object({
  paymentId: z.string(),
  refunded: z.boolean(),
  message: z.string().optional(),
  /** Vendor-side refund record id, when available. */
  refundId: z.string().optional(),
});
export type RefundResult = z.infer<typeof refundResultSchema>;

// ---------------------------------------------------------------------
// How connectors extend the base shapes.
// ---------------------------------------------------------------------
//
// Each connector adds a namespaced `vendor.<vendorName>` field to the
// base input/result schemas. The recommended pattern is plain `.extend`
// — TypeScript's inference is sharper that way than via a helper:
//
//   import {
//     paymentLinkInputBaseSchema,
//   } from '@mcify/payments-chile';
//
//   const khipuVendorSchema = z.object({
//     bankId: z.string().optional(),
//     sendEmail: z.boolean().optional(),
//   });
//
//   export const paymentLinkInputSchema = paymentLinkInputBaseSchema.extend({
//     vendor: z.object({ khipu: khipuVendorSchema.optional() }).optional(),
//   });
//
// This keeps autocompletion working through the full path
// (`input.vendor.khipu.bankId`) without losing types when the connector
// reads them.
