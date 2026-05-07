# @mcify/payments-chile

Vendor-agnostic types and helpers for Chilean payment-link APIs (Khipu, Mercado Pago, Webpay/Transbank, Smart Checkout via Fintoc).

> **Status:** alpha. Used by mcify connectors to expose a portable shape across vendors so the agent reasons about "payment links" the same way regardless of which vendor backs the merchant.

## What's in here

- `paymentLinkInputBaseSchema` / `PaymentLinkInputBase` — what an agent passes to create a link.
- `paymentLinkResultBaseSchema` / `PaymentLinkResultBase` — what the connector returns.
- `paymentLinkStatusSchema` / `PaymentLinkStatus` — the canonical six-state lifecycle.
- `paymentCustomerSchema` / `PaymentCustomer` — payer identity.
- `refundInputSchema` / `RefundInput`, `refundResultSchema` / `RefundResult` — refund flow.
- `bankItemSchema` / `BankItem`, `paymentMethodItemSchema` / `PaymentMethodItem` — read-only catalogs.

Everything is a Zod schema; types are inferred via `z.infer`.

## The canonical six-state lifecycle

Each vendor has its own native states. Connectors collapse them into a stable six-state canon so the agent reasons uniformly:

| Portable state | What it means                                                      |
| -------------- | ------------------------------------------------------------------ |
| `pending`      | Created but not yet paid.                                          |
| `paid`         | Customer paid; merchant has the funds (or will after settlement).  |
| `expired`      | Link reached its expiration without being paid.                    |
| `cancelled`    | Merchant cancelled the link before payment.                        |
| `failed`       | Payment attempt failed (declined, insufficient funds, anti-fraud). |
| `refunded`     | Was paid but funds were returned to the customer.                  |

Connectors map their native states using a `mapXyzStatus` helper. For example:

- **Khipu**: `done`/`committed` → `paid`, `verifying`/`pending` → `pending`, `rejected`/`failed` → `failed`.
- **Mercado Pago**: `approved`/`authorized` → `paid`, `pending`/`in_process`/`in_mediation` → `pending`, `rejected` → `failed`, `cancelled` → `cancelled`, `refunded`/`charged_back` → `refunded`.

## Usage in a connector

Each connector extends the base input/result with a `vendor.<name>` namespace for its own knobs:

```ts
import { z } from 'zod';
import {
  paymentLinkInputBaseSchema,
  paymentLinkResultBaseSchema,
  paymentLinkStatusSchema,
  refundInputSchema,
} from '@mcify/payments-chile';

const khipuVendorOptionsSchema = z.object({
  bankId: z.string().optional(),
  sendEmail: z.boolean().optional(),
});

export const paymentLinkInputSchema = paymentLinkInputBaseSchema.extend({
  vendor: z.object({ khipu: khipuVendorOptionsSchema.optional() }).optional(),
});
export type PaymentLinkInput = z.infer<typeof paymentLinkInputSchema>;

// Re-export the portable bits so tools can import from a single place.
export {
  paymentLinkStatusSchema,
  refundInputSchema,
  type PaymentLinkStatus,
  type RefundInput,
} from '@mcify/payments-chile';
```

The connector's tools then accept `PaymentLinkInput`, build the vendor's native payload, and return `PaymentLinkResult` — the agent never sees the vendor-specific shape.

## Connectors using these types

| Connector    | Package                                                 | Status         |
| ------------ | ------------------------------------------------------- | -------------- |
| Khipu        | [`@mcify/example-khipu`](../examples/khipu)             | First adopter  |
| Mercado Pago | [`@mcify/example-mercadopago`](../examples/mercadopago) | Second adopter |

A future Webpay or Smart Checkout connector follows the same pattern.

## Why a separate package

Two adopters validated that the shape generalises. The third connector should not be the one to discover the abstraction is wrong — extracting now means each new connector is mechanical to add: define the vendor namespace, map the native status, and you're done.

## License

Apache-2.0 (same as mcify).
