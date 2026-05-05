import type { AuthConfig } from './types.js';

export function none(): Extract<AuthConfig, { type: 'none' }> {
  return { type: 'none' };
}
