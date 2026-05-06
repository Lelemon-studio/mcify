import { describe, it, expect } from 'vitest';
import { schemaToZod } from './schema-to-zod.js';

const noopRefs = {
  resolveRef: (ref: string) => `Ref_${ref}`,
};

describe('schemaToZod', () => {
  it('maps primitive types', () => {
    expect(schemaToZod({ type: 'string' }, noopRefs)).toBe('z.string()');
    expect(schemaToZod({ type: 'number' }, noopRefs)).toBe('z.number()');
    expect(schemaToZod({ type: 'integer' }, noopRefs)).toBe('z.number().int()');
    expect(schemaToZod({ type: 'boolean' }, noopRefs)).toBe('z.boolean()');
  });

  it('applies string formats', () => {
    expect(schemaToZod({ type: 'string', format: 'email' }, noopRefs)).toBe('z.string().email()');
    expect(schemaToZod({ type: 'string', format: 'uuid' }, noopRefs)).toBe('z.string().uuid()');
    expect(schemaToZod({ type: 'string', format: 'uri' }, noopRefs)).toBe('z.string().url()');
    expect(schemaToZod({ type: 'string', format: 'date-time' }, noopRefs)).toBe(
      'z.string().datetime()',
    );
  });

  it('applies length and pattern constraints', () => {
    expect(
      schemaToZod({ type: 'string', minLength: 3, maxLength: 10, pattern: '^foo' }, noopRefs),
    ).toBe('z.string().min(3).max(10).regex(/^foo/)');
    expect(schemaToZod({ type: 'integer', minimum: 0, maximum: 100 }, noopRefs)).toBe(
      'z.number().int().min(0).max(100)',
    );
  });

  it('handles enums of strings', () => {
    expect(schemaToZod({ type: 'string', enum: ['a', 'b'] }, noopRefs)).toBe('z.enum(["a", "b"])');
  });

  it('builds objects with required + optional fields', () => {
    const out = schemaToZod(
      {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
      },
      noopRefs,
    );
    expect(out).toContain('name: z.string()');
    expect(out).toContain('age: z.number().int().optional()');
    expect(out).toMatch(/^z\.object\(\{/);
  });

  it('treats type-less object with properties as an object', () => {
    const out = schemaToZod(
      {
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      noopRefs,
    );
    expect(out).toMatch(/^z\.object\(\{/);
    expect(out).toContain('id: z.string()');
  });

  it('quotes property keys that need it', () => {
    const out = schemaToZod(
      {
        type: 'object',
        required: ['weird-key'],
        properties: { 'weird-key': { type: 'string' } },
      },
      noopRefs,
    );
    expect(out).toContain('"weird-key": z.string()');
  });

  it('builds arrays', () => {
    expect(schemaToZod({ type: 'array', items: { type: 'string' } }, noopRefs)).toBe(
      'z.array(z.string())',
    );
  });

  it('resolves $ref through the callback', () => {
    expect(schemaToZod({ $ref: '#/components/schemas/User' }, noopRefs)).toBe(
      'Ref_#/components/schemas/User',
    );
  });

  it('maps oneOf/anyOf to z.union and allOf to z.intersection', () => {
    expect(schemaToZod({ oneOf: [{ type: 'string' }, { type: 'number' }] }, noopRefs)).toBe(
      'z.union([z.string(), z.number()])',
    );
    expect(schemaToZod({ allOf: [{ type: 'object' }, { type: 'object' }] }, noopRefs)).toBe(
      'z.intersection(z.unknown(), z.unknown())',
    );
  });

  it('marks nullable schemas with .nullable()', () => {
    expect(schemaToZod({ type: 'string', nullable: true }, noopRefs)).toBe('z.string().nullable()');
  });

  it('maps record-style additionalProperties', () => {
    const out = schemaToZod({ type: 'object', additionalProperties: { type: 'number' } }, noopRefs);
    expect(out).toBe('z.record(z.number())');
  });
});
