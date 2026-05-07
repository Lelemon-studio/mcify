/**
 * Read-only catalog shapes for banks and payment methods exposed by
 * Chilean payment-link APIs. Same portable shape across vendors.
 */

import { z } from 'zod';

export const bankItemSchema = z.object({
  bankId: z.string().describe('Vendor-side identifier for the bank.'),
  name: z.string(),
  message: z
    .string()
    .optional()
    .describe('Vendor-side notice (e.g. "available", "in maintenance").'),
  minAmount: z
    .number()
    .optional()
    .describe('Minimum amount this bank accepts (in the smallest currency unit).'),
  type: z.string().optional(),
});
export type BankItem = z.infer<typeof bankItemSchema>;

export const paymentMethodItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  paymentTypeId: z
    .string()
    .optional()
    .describe('Vendor-side classification (e.g. "credit_card", "bank_transfer").'),
  status: z.string().optional(),
  thumbnail: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  available: z.boolean().optional(),
});
export type PaymentMethodItem = z.infer<typeof paymentMethodItemSchema>;
