import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { schema } from './index.js';

describe('schema helpers', () => {
  describe('id', () => {
    it('rejects empty string', () => {
      expect(schema.id().safeParse('').success).toBe(false);
    });
    it('accepts a normal id', () => {
      expect(schema.id().safeParse('user_123').success).toBe(true);
    });
    it('respects custom max length', () => {
      const long = 'x'.repeat(257);
      expect(schema.id(256).safeParse(long).success).toBe(false);
      expect(schema.id(300).safeParse(long).success).toBe(true);
    });
  });

  describe('url', () => {
    it('accepts any URL', () => {
      expect(schema.url().safeParse('https://example.com').success).toBe(true);
      expect(schema.url().safeParse('ftp://example.com').success).toBe(true);
    });
    it('rejects non-URL', () => {
      expect(schema.url().safeParse('not a url').success).toBe(false);
    });
  });

  describe('httpUrl', () => {
    it('accepts http and https', () => {
      expect(schema.httpUrl().safeParse('http://example.com').success).toBe(true);
      expect(schema.httpUrl().safeParse('https://example.com').success).toBe(true);
    });
    it('rejects ftp and other protocols', () => {
      expect(schema.httpUrl().safeParse('ftp://example.com').success).toBe(false);
    });
  });

  describe('timestamp', () => {
    it('accepts ISO 8601 with offset', () => {
      expect(schema.timestamp().safeParse('2026-05-05T10:30:00Z').success).toBe(true);
      expect(schema.timestamp().safeParse('2026-05-05T10:30:00-03:00').success).toBe(true);
    });
    it('rejects bare date', () => {
      expect(schema.timestamp().safeParse('2026-05-05').success).toBe(false);
    });
  });

  describe('money', () => {
    it('validates and uppercases currency', () => {
      const result = schema.money().safeParse({ amount: 1000, currency: 'clp' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('CLP');
      }
    });
    it('rejects non-finite amount', () => {
      expect(schema.money().safeParse({ amount: Infinity, currency: 'USD' }).success).toBe(false);
    });
    it('rejects bad currency length', () => {
      expect(schema.money().safeParse({ amount: 100, currency: 'PESO' }).success).toBe(false);
    });
  });

  describe('paginated', () => {
    it('wraps an item schema', () => {
      const list = schema.paginated(z.object({ id: z.string() }));
      const result = list.safeParse({
        items: [{ id: 'a' }, { id: 'b' }],
        cursor: 'next-page',
        total: 2,
      });
      expect(result.success).toBe(true);
    });
    it('allows omitting cursor and total', () => {
      const list = schema.paginated(z.string());
      expect(list.safeParse({ items: ['a', 'b'] }).success).toBe(true);
    });
    it('rejects invalid item shape', () => {
      const list = schema.paginated(z.object({ id: z.string() }));
      expect(list.safeParse({ items: [{ id: 123 }] }).success).toBe(false);
    });
  });
});
