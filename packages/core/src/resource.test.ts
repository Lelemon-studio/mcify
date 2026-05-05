import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineResource, isResourceTemplate } from './resource.js';
import { McifyValidationError } from './errors.js';
import { createTestCtx } from './_test-utils/ctx.js';

describe('isResourceTemplate', () => {
  it('detects URI templates with placeholders', () => {
    expect(isResourceTemplate('bsale://invoices/{period}')).toBe(true);
    expect(isResourceTemplate('config://settings')).toBe(false);
    expect(isResourceTemplate('file:///{path}/resource')).toBe(true);
  });
});

describe('defineResource', () => {
  it('throws when uri is missing', () => {
    expect(() =>
      defineResource({
        uri: '',
        name: 'r',
        read: () => ({ mimeType: 'text/plain', text: 'x' }),
      }),
    ).toThrow(/uri/);
  });

  it('throws when name is missing', () => {
    expect(() =>
      defineResource({
        uri: 'config://x',
        name: '',
        read: () => ({ mimeType: 'text/plain', text: 'x' }),
      }),
    ).toThrow(/name/);
  });

  it('throws when URI is template but no params schema is provided', () => {
    expect(() =>
      defineResource({
        uri: 'config://{key}',
        name: 'r',
        read: () => ({ mimeType: 'text/plain', text: 'x' }),
      }),
    ).toThrow(/placeholders/);
  });

  it('reads a static resource', async () => {
    const r = defineResource({
      uri: 'config://settings',
      name: 'settings',
      mimeType: 'application/json',
      read: () => ({ mimeType: 'application/json', text: '{"theme":"dark"}' }),
    });
    expect(r.isTemplate).toBe(false);
    const result = await r.read(undefined, createTestCtx());
    expect(result).toEqual({ mimeType: 'application/json', text: '{"theme":"dark"}' });
  });

  it('reads a template resource and validates params', async () => {
    const r = defineResource({
      uri: 'bsale://invoices/{period}',
      name: 'invoices-by-period',
      params: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }),
      read: ({ period }) => ({
        mimeType: 'application/json',
        text: JSON.stringify({ period, items: [] }),
      }),
    });
    expect(r.isTemplate).toBe(true);
    const result = await r.read({ period: '2026-04' }, createTestCtx());
    expect(JSON.parse(result.text ?? '')).toEqual({ period: '2026-04', items: [] });
  });

  it('throws McifyValidationError on invalid params', async () => {
    const r = defineResource({
      uri: 'bsale://invoices/{period}',
      name: 'invoices-by-period',
      params: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }),
      read: () => ({ mimeType: 'application/json', text: '{}' }),
    });
    await expect(r.read({ period: 'not-a-date' }, createTestCtx())).rejects.toBeInstanceOf(
      McifyValidationError,
    );
  });

  it('marks the resource with __mcify brand', () => {
    const r = defineResource({
      uri: 'config://x',
      name: 'r',
      read: () => ({ mimeType: 'text/plain', text: 'x' }),
    });
    expect(r.__mcify).toBe('resource');
  });
});
