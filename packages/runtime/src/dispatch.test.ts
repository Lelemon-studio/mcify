import { describe, it, expect } from 'vitest';
import { dispatch, matchUriTemplate } from './dispatch.js';
import { buildHandlerContext } from './context.js';
import { JsonRpcErrorCodes as Codes } from './jsonrpc.js';
import { buildSampleConfig } from './_test-utils/fixtures.js';

const ctx = () => buildHandlerContext();

describe('matchUriTemplate', () => {
  it('matches and extracts named groups', () => {
    expect(matchUriTemplate('file:///{path}', 'file:///etc/hosts')).toEqual({ path: 'etc/hosts' });
  });
  it('returns null when not matching', () => {
    expect(matchUriTemplate('file:///{path}', 'http://example.com')).toBeNull();
  });
  it('handles multiple placeholders', () => {
    expect(matchUriTemplate('api://{org}/{repo}', 'api://anthropic/claude')).toEqual({
      org: 'anthropic',
      repo: 'claude',
    });
  });
});

describe('dispatch', () => {
  it('rejects malformed JSON-RPC request', async () => {
    const res = await dispatch({ method: 'foo' }, buildSampleConfig(), ctx());
    expect(res).toMatchObject({ error: { code: Codes.InvalidRequest } });
  });

  describe('initialize', () => {
    it('returns protocolVersion + capabilities + serverInfo', async () => {
      const res = await dispatch(
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: expect.any(String),
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: 'sample-server', version: '0.1.0' },
        },
      });
    });
  });

  describe('tools/list', () => {
    it('returns the tools with their JSON Schema', async () => {
      const res = await dispatch(
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'add', description: 'Add two numbers' }),
          ]),
        },
      });
    });
  });

  describe('tools/call', () => {
    it('invokes a tool and returns text content with the JSON result', async () => {
      const res = await dispatch(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'add', arguments: { a: 2, b: 3 } },
        },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: { content: [{ type: 'text', text: '{"sum":5}' }] },
      });
    });

    it('returns NotFound when tool name does not exist', async () => {
      const res = await dispatch(
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'doesnt-exist', arguments: {} },
        },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({ error: { code: Codes.NotFound } });
    });

    it('returns isError content when input is invalid', async () => {
      const res = await dispatch(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'add', arguments: { a: 'not a number' } },
        },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: { isError: true, content: [{ type: 'text', text: expect.stringContaining('validation error') }] },
      });
    });

    it('returns isError content when handler throws', async () => {
      const res = await dispatch(
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: { name: 'fail', arguments: {} },
        },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: { isError: true, content: [{ type: 'text', text: 'boom' }] },
      });
    });
  });

  describe('resources', () => {
    it('lists static resources', async () => {
      const res = await dispatch(
        { jsonrpc: '2.0', id: 7, method: 'resources/list' },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: {
          resources: [
            expect.objectContaining({ uri: 'config://settings', mimeType: 'application/json' }),
          ],
        },
      });
    });

    it('lists resource templates', async () => {
      const res = await dispatch(
        { jsonrpc: '2.0', id: 8, method: 'resources/templates/list' },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: {
          resourceTemplates: [
            expect.objectContaining({ uriTemplate: 'file:///{path}', name: 'file-by-path' }),
          ],
        },
      });
    });

    it('reads a static resource by URI', async () => {
      const res = await dispatch(
        { jsonrpc: '2.0', id: 9, method: 'resources/read', params: { uri: 'config://settings' } },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: {
          contents: [{ uri: 'config://settings', mimeType: 'application/json', text: '{"theme":"dark"}' }],
        },
      });
    });

    it('reads a template resource and substitutes params', async () => {
      const res = await dispatch(
        {
          jsonrpc: '2.0',
          id: 10,
          method: 'resources/read',
          params: { uri: 'file:///etc/hosts' },
        },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: {
          contents: [{ uri: 'file:///etc/hosts', text: 'contents of etc/hosts' }],
        },
      });
    });

    it('returns NotFound when URI matches no resource', async () => {
      const res = await dispatch(
        {
          jsonrpc: '2.0',
          id: 11,
          method: 'resources/read',
          params: { uri: 'unknown://x' },
        },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({ error: { code: Codes.NotFound } });
    });
  });

  describe('prompts', () => {
    it('lists prompts', async () => {
      const res = await dispatch(
        { jsonrpc: '2.0', id: 12, method: 'prompts/list' },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: { prompts: [expect.objectContaining({ name: 'greet' })] },
      });
    });

    it('renders a prompt with arguments', async () => {
      const res = await dispatch(
        {
          jsonrpc: '2.0',
          id: 13,
          method: 'prompts/get',
          params: { name: 'greet', arguments: { who: 'Camilo' } },
        },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({
        result: {
          description: 'Say hello to someone',
          messages: [{ role: 'user', content: { type: 'text', text: 'hello Camilo' } }],
        },
      });
    });
  });

  describe('notifications', () => {
    it('returns null for notifications/initialized', async () => {
      const res = await dispatch(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toBeNull();
    });
  });

  describe('unknown methods', () => {
    it('returns MethodNotFound', async () => {
      const res = await dispatch(
        { jsonrpc: '2.0', id: 99, method: 'something/weird' },
        buildSampleConfig(),
        ctx(),
      );
      expect(res).toMatchObject({ error: { code: Codes.MethodNotFound } });
    });
  });
});
