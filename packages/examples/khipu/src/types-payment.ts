/**
 * Khipu-flavoured payment-link types.
 *
 * The portable shape lives in `@mcify/payments-chile`. This file
 * extends the base schemas with Khipu's vendor-specific knobs (bank
 * pinning, mandatory payment method, integrator fee, etc.) under the
 * `vendor.khipu` namespace.
 */

import { z } from 'zod';
import { paymentLinkInputBaseSchema, paymentLinkResultBaseSchema } from '@mcify/payments-chile';

// Re-export the portable bits so tools can import them from a single place.
export {
  paymentLinkStatusSchema,
  paymentCustomerSchema,
  refundInputSchema,
  refundResultSchema,
  bankItemSchema,
  paymentMethodItemSchema,
  type PaymentLinkStatus,
  type PaymentCustomer,
  type RefundInput,
  type RefundResult,
  type BankItem,
  type PaymentMethodItem,
} from '@mcify/payments-chile';

// ---------------------------------------------------------------------
// Khipu-specific vendor extensions.
// ---------------------------------------------------------------------

const khipuVendorOptionsSchema = z.object({
  bankId: z.string().optional().describe('Restrict the link to a specific bank.'),
  mandatoryPaymentMethod: z.string().optional().describe('Force a specific Khipu payment method.'),
  sendEmail: z.boolean().optional(),
  sendReminders: z.boolean().optional(),
  payerName: z.string().optional(),
  payerEmail: z.string().email().optional(),
  fixedPayerPersonalIdentifier: z.string().optional(),
  integratorFee: z.number().nonnegative().optional(),
});

const khipuResultExtrasSchema = z.object({
  simplifiedTransferUrl: z.string().url().optional(),
  transferUrl: z.string().url().optional(),
  webpayUrl: z.string().url().optional(),
  appUrl: z.string().optional(),
  notificationToken: z.string().optional(),
  readyForTerminal: z.boolean().optional(),
});

export const paymentLinkInputSchema = paymentLinkInputBaseSchema.extend({
  vendor: z.object({ khipu: khipuVendorOptionsSchema.optional() }).optional(),
});
export type PaymentLinkInput = z.infer<typeof paymentLinkInputSchema>;

export const paymentLinkResultSchema = paymentLinkResultBaseSchema.extend({
  vendor: z.object({ khipu: khipuResultExtrasSchema.optional() }).optional(),
});
export type PaymentLinkResult = z.infer<typeof paymentLinkResultSchema>;
