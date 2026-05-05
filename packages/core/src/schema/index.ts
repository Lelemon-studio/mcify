import { z } from 'zod';

const id = (max = 256) => z.string().min(1).max(max);

const url = () => z.string().url();

const httpUrl = () =>
  z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), {
      message: 'must be an http or https URL',
    });

const timestamp = () => z.string().datetime({ offset: true });

const money = () =>
  z.object({
    amount: z.number().finite(),
    currency: z
      .string()
      .length(3)
      .transform((s) => s.toUpperCase()),
  });

const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    cursor: z.string().nullable().optional(),
    total: z.number().int().nonnegative().optional(),
  });

export const schema = {
  id,
  url,
  httpUrl,
  timestamp,
  money,
  paginated,
} as const;
