import { describe, it, expect } from 'vitest';
import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('handles bare positional args', () => {
    expect(parseArgs(['init', 'my-mcp'])).toEqual({
      positional: ['init', 'my-mcp'],
      flags: {},
    });
  });

  it('parses --flag value', () => {
    expect(parseArgs(['dev', '--port', '3000'])).toEqual({
      positional: ['dev'],
      flags: { port: '3000' },
    });
  });

  it('parses --flag=value', () => {
    expect(parseArgs(['init', 'my-mcp', '--template=from-scratch'])).toEqual({
      positional: ['init', 'my-mcp'],
      flags: { template: 'from-scratch' },
    });
  });

  it('treats lone --flag as boolean', () => {
    expect(parseArgs(['build', '--watch'])).toEqual({
      positional: ['build'],
      flags: { watch: true },
    });
  });

  it('parses --no-flag as flag = false', () => {
    expect(parseArgs(['dev', '--no-watch'])).toEqual({
      positional: ['dev'],
      flags: { watch: false },
    });
  });

  it('parses short -x flags as boolean', () => {
    expect(parseArgs(['dev', '-v'])).toEqual({
      positional: ['dev'],
      flags: { v: true },
    });
  });

  it('treats everything after `--` as positional', () => {
    expect(parseArgs(['dev', '--', '--not-a-flag', 'literal'])).toEqual({
      positional: ['dev', '--not-a-flag', 'literal'],
      flags: {},
    });
  });

  it('combines positional + flags in any order', () => {
    expect(parseArgs(['--port', '3000', 'init', 'my-mcp', '--template', 'from-scratch'])).toEqual({
      positional: ['init', 'my-mcp'],
      flags: { port: '3000', template: 'from-scratch' },
    });
  });
});
