import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { defineConfig, defineTool, defineResource, definePrompt } from '@mcify/core';
import { EventBus, buildConfigSnapshot, type RuntimeEvent } from './events.js';

describe('EventBus', () => {
  it('delivers events to subscribed listeners', () => {
    const bus = new EventBus();
    const events: RuntimeEvent[] = [];
    bus.on((e) => events.push(e));

    bus.emit({
      type: 'tool:called',
      id: bus.nextId(),
      timestamp: '2026-05-05T12:00:00Z',
      toolName: 'foo',
      args: {},
      result: { ok: true },
      durationMs: 5,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'tool:called', toolName: 'foo' });
  });

  it('returns an unsubscribe function', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on(fn);
    off();
    bus.emit({
      type: 'config:loaded',
      id: bus.nextId(),
      timestamp: 'now',
      serverName: 's',
      serverVersion: '1',
      toolCount: 0,
      resourceCount: 0,
      promptCount: 0,
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('isolates listener errors', () => {
    const bus = new EventBus();
    const ok = vi.fn();
    bus.on(() => {
      throw new Error('boom');
    });
    bus.on(ok);
    bus.emit({
      type: 'config:loaded',
      id: bus.nextId(),
      timestamp: 'now',
      serverName: 's',
      serverVersion: '1',
      toolCount: 0,
      resourceCount: 0,
      promptCount: 0,
    });
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('survives a listener that unsubscribes during emit', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const off1: () => void = bus.on(() => {
      calls.push('a');
      off1();
    });
    bus.on(() => calls.push('b'));
    bus.emit({
      type: 'ping' as never,
      id: bus.nextId(),
      timestamp: 'now',
      toolName: '',
      args: {},
      durationMs: 0,
    } as unknown as RuntimeEvent);
    expect(calls).toEqual(['a', 'b']);
  });

  it('reports active listener count', () => {
    const bus = new EventBus();
    expect(bus.listenerCount()).toBe(0);
    const off = bus.on(() => undefined);
    expect(bus.listenerCount()).toBe(1);
    off();
    expect(bus.listenerCount()).toBe(0);
  });

  it('generates unique ids', () => {
    const bus = new EventBus();
    const ids = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      ids.add(bus.nextId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('buildConfigSnapshot', () => {
  it('flattens tools, resources, and prompts into the snapshot shape', () => {
    const config = defineConfig({
      name: 'demo',
      version: '0.1.0',
      description: 'demo server',
      tools: [
        defineTool({
          name: 'add',
          description: 'add two numbers',
          input: z.object({ a: z.number(), b: z.number() }),
          output: z.object({ sum: z.number() }),
          handler: ({ a, b }) => ({ sum: a + b }),
        }),
      ],
      resources: [
        defineResource({
          uri: 'file:///{path}',
          name: 'file',
          params: z.object({ path: z.string() }),
          read: () => ({ mimeType: 'text/plain', text: 'x' }),
        }),
      ],
      prompts: [
        definePrompt({
          name: 'greet',
          arguments: z.object({ who: z.string() }),
          render: ({ who }) => [{ role: 'user', content: who }],
        }),
      ],
    });

    const snap = buildConfigSnapshot(config);
    expect(snap.name).toBe('demo');
    expect(snap.description).toBe('demo server');
    expect(snap.tools).toHaveLength(1);
    expect(snap.tools[0]?.inputSchema).toBeDefined();
    expect(snap.tools[0]?.outputSchema).toBeDefined();
    expect(snap.resources).toHaveLength(1);
    expect(snap.resources[0]?.isTemplate).toBe(true);
    expect(snap.prompts).toHaveLength(1);
    expect(snap.prompts[0]?.argumentsSchema).toBeDefined();
  });

  it('handles a config with no tools/resources/prompts', () => {
    const snap = buildConfigSnapshot({ name: 'x', version: '1' });
    expect(snap).toEqual({ name: 'x', version: '1', tools: [], resources: [], prompts: [] });
  });
});
