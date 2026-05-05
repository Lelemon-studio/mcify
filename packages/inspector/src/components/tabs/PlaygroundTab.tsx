import { useEffect, useMemo, useState } from 'react';
import type { ServerSnapshot } from '../../lib/types';
import { api } from '../../lib/api';

export const PlaygroundTab = ({ snapshot }: { snapshot: ServerSnapshot }) => {
  const [selectedTool, setSelectedTool] = useState<string>(() => snapshot.tools[0]?.name ?? '');
  const [argsText, setArgsText] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<
    { ok: true; result: unknown; durationMs: number } | { ok: false; error: string } | null
  >(null);

  const tool = useMemo(
    () => snapshot.tools.find((t) => t.name === selectedTool),
    [snapshot.tools, selectedTool],
  );

  // Switching tools wipes the previous args + response so old input from
  // tool A doesn't leak into tool B's invocation.
  useEffect(() => {
    setArgsText('{}');
    setResponse(null);
  }, [selectedTool]);

  if (snapshot.tools.length === 0) {
    return (
      <div className="empty">
        No tools to invoke. Add one in <code>mcify.config.ts</code>.
      </div>
    );
  }

  const run = async (): Promise<void> => {
    if (!tool) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(argsText || '{}');
    } catch (e) {
      setResponse({
        ok: false,
        error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
      });
      return;
    }
    setBusy(true);
    setResponse(null);
    const start = performance.now();
    try {
      const res = await api.invokeTool(tool.name, parsed);
      const durationMs = Math.round(performance.now() - start);
      if (res.ok) {
        setResponse({ ok: true, result: res.result, durationMs });
      } else {
        setResponse({ ok: false, error: res.error });
      }
    } catch (e) {
      setResponse({ ok: false, error: e instanceof Error ? e.message : 'request failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, height: '100%' }}>
      <div>
        <div className="title-row">
          <h2>Playground</h2>
        </div>

        <label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
          TOOL
        </label>
        <select
          value={selectedTool}
          onChange={(e) => setSelectedTool(e.target.value)}
          style={{ width: '100%', marginBottom: 16 }}
        >
          {snapshot.tools.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>

        {tool && (
          <>
            <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
              {tool.description}
            </div>

            <label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              ARGS (JSON)
            </label>
            <textarea
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={10}
              style={{ width: '100%', resize: 'vertical', minHeight: 200 }}
            />

            <div style={{ marginTop: 12 }}>
              <button onClick={run} disabled={busy}>
                {busy ? 'Invoking…' : 'Invoke'}
              </button>
            </div>
          </>
        )}
      </div>

      <div>
        <div className="title-row">
          <h2>Response</h2>
          {response && response.ok && <span className="muted mono">{response.durationMs}ms</span>}
        </div>
        {!response ? (
          <div className="empty">Invoke a tool to see its response here.</div>
        ) : response.ok ? (
          <pre>{JSON.stringify(response.result, null, 2)}</pre>
        ) : (
          <pre style={{ color: 'var(--error)' }}>{response.error}</pre>
        )}
      </div>
    </div>
  );
};
