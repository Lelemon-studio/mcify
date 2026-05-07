/**
 * Mercado Pago-flavoured payment-link types.
 *
 * The portable shape lives in `@mcify/payments-chile`. This file
 * extends the base schemas with MP's vendor-specific knobs (per-line
 * items, excluded payment methods, installments, statement descriptor)
 * under the `vendor.mercadopago` namespace.
 */

import { z } from 'zod';
import { paymentLinkInputBaseSchema, paymentLinkResultBaseSchema } from '@mcify/payments-chile';

export {
  paymentLinkStatusSchema,
  paymentCustomerSchema,
  refundInputSchema,
  refundResultSchema,
  paymentMethodItemSchema,
  type PaymentLinkStatus,
  type PaymentCustomer,
  type RefundInput,
  type RefundResult,
  type PaymentMethodItem,
} from '@mcify/payments-chile';

// ---------------------------------------------------------------------
// Mercado Pago-specific vendor extensions.
// ---------------------------------------------------------------------

const mercadoPagoVendorOptionsSchema = z.object({
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
      'Per-line items. If provided, overrides the single-line fallback built from subject/amount.',
    ),
  excludedPaymentMethods: z.array(z.string()).optional(),
  excludedPaymentTypes: z.array(z.string()).optional(),
  installments: z.number().int().positive().max(36).optional(),
  statementDescriptor: z.string().max(22).optional(),
  autoReturn: z.enum(['approved', 'all']).optional(),
});

const mercadoPagoResultExtrasSchema = z.object({
  sandboxInitPoint: z.string().url().optional(),
  paymentId: z.string().optional(),
  paymentStatus: z.string().optional(),
  paymentStatusDetail: z.string().optional(),
});

export const paymentLinkInputSchema = paymentLinkInputBaseSchema.extend({
  vendor: z.object({ mercadopago: mercadoPagoVendorOptionsSchema.optional() }).optional(),
});
export type PaymentLinkInput = z.infer<typeof paymentLinkInputSchema>;

export const paymentLinkResultSchema = paymentLinkResultBaseSchema.extend({
  vendor: z.object({ mercadopago: mercadoPagoResultExtrasSchema.optional() }).optional(),
});
export type PaymentLinkResult = z.infer<typeof paymentLinkResultSchema>;
