export { FintocClient, FintocApiError } from './client.js';
export type {
  FintocClientOptions,
  AccountRecord,
  MovementRecord,
  MovementType,
  ListMovementsParams,
} from './client.js';
export { createFintocListAccountsTool } from './tools/list-accounts.js';
export { createFintocGetAccountBalanceTool } from './tools/get-account-balance.js';
export { createFintocListMovementsTool } from './tools/list-movements.js';
