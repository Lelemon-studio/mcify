/**
 * Vendor-agnostic types for Chilean payment links — second adopter
 * after Khipu. The shape is identical to `@mcify/example-khipu`'s
 * `types-payment.ts`; the only diff is the `vendor` namespace which
 * holds Mercado Pago-specific extras.
 *
 * When a third connector adopts these types, they move to a shared
 * `@mcify/payments-chile` package and this file becomes a re-export.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------
// Status — the canonical six-state lifecycle.
// ---------------------------------------------------------------------

export const paymentLinkStatusSchema = z.enum([
  'pending', // Created but not yet paid by the customer.
  'paid', // Customer paid; merchant received the funds (or will after settlement).
  'expired', // Link reached its expiration without being paid.
  'cancelled', // Merchant cancelled the link before payment.
  'failed', // Payment attempt failed.
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
    .describe('Amount in the major unit of the currency (CLP whole pesos).'),
  currency: z.enum(['CLP', 'USD']).describe('ISO 4217 currency code.'),
  customer: paymentCustomerSchema.optional(),
  externalId: z
    .string()
    .max(64)
    .optional()
    .describe(
      'Merchant-side identifier for this payment. Echoed back as `external_reference` in MP.',
    ),
  description: z.string().max(1000).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  notifyUrl: z
    .string()
    .url()
    .optional()
    .describe('Webhook URL MP will POST status updates to (notification_url).'),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/)
    .optional(),
  /**
   * Vendor-specific advanced fields. Mercado Pago has a richer
   * preference model than Khipu, so a few advanced cases are exposed
   * under `vendor.mercadopago`.
   */
  vendor: z
    .object({
      mercadopago: z
        .object({
          /** Per-line items if you want detailed line-by-line presentation. */
          items: z
            .array(
              z.object({
                title: z.string().max(255),
                quantity: z.number().int().positive(),
                unitPrice: z.number().positive(),
                description: z.string().max(1000).optional(),
                pictureUrl: z.string().url().optional(),
                categoryId: z.string().optional(),
              }),
            )
            .optional()
            .describe(
              'Per-line items. If provided, overrides the single-line fallback built from ' +
                'subject/amount.',
            ),
          /** Restrict accepted payment methods (excluded). */
          excludedPaymentMethods: z.array(z.string()).optional(),
          /** Restrict accepted payment types ("credit_card", "debit_card", etc.). */
          excludedPaymentTypes: z.array(z.string()).optional(),
          /** Max number of installments to offer (1 disables installments). */
          installments: z.number().int().positive().max(36).optional(),
          /** Mark the merchant on receipts. Max 22 chars. */
          statementDescriptor: z.string().max(22).optional(),
          /** Auto-return on success: 'approved' or 'all'. */
          autoReturn: z.enum(['approved', 'all']).optional(),
        })
        .optional(),
    })
    .optional(),
});
export type PaymentLinkInput = z.infer<typeof paymentLinkInputSchema>;

// ---------------------------------------------------------------------
// Result.
// ---------------------------------------------------------------------

export const paymentLinkResultSchema = z.object({
  paymentId: z.string().describe('Vendor-issued unique identifier (MP preference id).'),
  paymentUrl: z.string().url().describe('Primary URL to share with the payer (MP `init_point`).'),
  status: paymentLinkStatusSchema,
  amount: z.number(),
  currency: z.string(),
  subject: z.string(),
  externalId: z.string().optional(),
  expiresAt: z.string().optional(),
  paidAt: z.string().optional(),
  receiptUrl: z.string().url().optional(),
  vendor: z
    .object({
      mercadopago: z
        .object({
          /** Sandbox URL alternative (only when the org is on sandbox). */
          sandboxInitPoint: z.string().url().optional(),
          /** Underlying payment id, when a payment has been made. */
          paymentId: z.string().optional(),
          /** Native MP status of the underlying payment (approved/pending/rejected/...). */
          paymentStatus: z.string().optional(),
          /** MP status_detail surfacing the rejection reason. */
          paymentStatusDetail: z.string().optional(),
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
  paymentId: z
    .string()
    .min(1)
    .describe(
      'Either the MP preference id (the connector resolves the underlying payment) or the ' +
        'MP payment id directly. Both work — the connector tries preference→payment lookup ' +
        'first, then falls back to treating the id as a payment.',
    ),
  amount: z.number().positive().optional().describe('Amount to refund. Omit for full refund.'),
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
// Payment methods catalog.
// ---------------------------------------------------------------------

export const paymentMethodItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  paymentTypeId: z.string().optional(),
  status: z.string().optional(),
  thumbnail: z.string().url().optional(),
});
export type PaymentMethodItem = z.infer<typeof paymentMethodItemSchema>;
