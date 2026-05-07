/**
 * Vendor-agnostic types for Chilean payment links.
 *
 * Designed to be portable across the local payment-link ecosystem
 * (Khipu, Mercado Pago, Webpay, Smart Checkout / Fintoc). Each connector
 * maps from `PaymentLinkInput` to its native payload, so the LLM-facing
 * schema is identical regardless of which vendor backs the org.
 *
 * Eventually these move to `@mcify/payments-chile`. Living inline for
 * now until a second connector adopts them.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------
// Status — the canonical six-state lifecycle.
// ---------------------------------------------------------------------

/**
 * Portable payment-link status. Maps from each vendor's native states
 * to a stable six-state lifecycle the agent can reason about.
 */
export const paymentLinkStatusSchema = z.enum([
  'pending', // Created but not yet paid by the customer.
  'paid', // Customer paid; merchant received the funds (or will after settlement).
  'expired', // Link reached its expiration without being paid.
  'cancelled', // Merchant cancelled the link before payment.
  'failed', // Payment attempt failed (insufficient funds, bank error, etc.).
  'refunded', // Was paid but funds were returned to the customer.
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

export const paymentLinkInputSchema = z.object({
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
  /**
   * Vendor-specific advanced fields. Use sparingly — the schema is
   * portable for a reason. Each field stays optional and namespaced.
   */
  vendor: z
    .object({
      khipu: z
        .object({
          bankId: z.string().optional().describe('Restrict the link to a specific bank.'),
          mandatoryPaymentMethod: z
            .string()
            .optional()
            .describe('Force a specific Khipu payment method.'),
          sendEmail: z
            .boolean()
            .optional()
            .describe('Whether Khipu sends a notification email to the payer.'),
          sendReminders: z
            .boolean()
            .optional()
            .describe('Whether Khipu sends reminder emails before expiration.'),
          payerName: z.string().optional(),
          payerEmail: z.string().email().optional(),
          fixedPayerPersonalIdentifier: z.string().optional(),
          integratorFee: z
            .number()
            .nonnegative()
            .optional()
            .describe('Optional integrator fee in CLP for the platform.'),
        })
        .optional(),
    })
    .optional(),
});
export type PaymentLinkInput = z.infer<typeof paymentLinkInputSchema>;

// ---------------------------------------------------------------------
// Result — what the connector returns after creating / fetching a link.
// ---------------------------------------------------------------------

export const paymentLinkResultSchema = z.object({
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
  /**
   * Vendor-specific extras (alternative URLs, tokens, etc.) for cases
   * where the agent or downstream code needs them. Always optional and
   * namespaced.
   */
  vendor: z
    .object({
      khipu: z
        .object({
          simplifiedTransferUrl: z.string().url().optional(),
          transferUrl: z.string().url().optional(),
          webpayUrl: z.string().url().optional(),
          appUrl: z.string().optional(),
          notificationToken: z.string().optional(),
          readyForTerminal: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type PaymentLinkResult = z.infer<typeof paymentLinkResultSchema>;

// ---------------------------------------------------------------------
// Refunds.
// ---------------------------------------------------------------------

export const refundInputSchema = z.object({
  paymentId: z.string().min(1),
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
});
export type RefundResult = z.infer<typeof refundResultSchema>;

// ---------------------------------------------------------------------
// Banks / payment methods (read-only catalogs).
// ---------------------------------------------------------------------

export const bankItemSchema = z.object({
  bankId: z.string(),
  name: z.string(),
  message: z
    .string()
    .optional()
    .describe('Vendor-side notice (e.g. "available", "in maintenance").'),
  minAmount: z.number().optional(),
  type: z.string().optional(),
});
export type BankItem = z.infer<typeof bankItemSchema>;

export const paymentMethodItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.string().url().optional(),
  available: z.boolean().optional(),
});
export type PaymentMethodItem = z.infer<typeof paymentMethodItemSchema>;
