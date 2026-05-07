/**
 * `@mcify/payments-chile` — vendor-agnostic shapes for Chilean
 * payment-link APIs (Khipu, Mercado Pago, Webpay/Transbank, Smart
 * Checkout via Fintoc).
 *
 * Each connector built with mcify maps from these portable types to
 * its native payload, so the LLM-facing schema is identical across
 * vendors. The status enum collapses each vendor's native lifecycle
 * into a stable six-state canon (`pending`, `paid`, `expired`,
 * `cancelled`, `failed`, `refunded`).
 */

export * from './types.js';
export * from './bank.js';
