import { useState } from 'react';
import type { ToolCalledEvent } from '../../lib/types';

const truncate = (value: unknown, max = 48): string => {
  const json = JSON.stringify(value);
  if (json.length <= max) return json;
  return `${json.slice(0, max - 1)}…`;
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
};

export const CallsTab = ({ calls }: { calls: ToolCalledEvent[] }) => {
  const [selected, setSelected] = useState<ToolCalledEvent | null>(null);

  if (calls.length === 0) {
    return (
      <div className="empty">
        No calls yet. Invoke a tool from the <strong>Playground</strong> tab, or hit{' '}
        <code>POST http://localhost:8888/mcp</code> from your MCP client.
      </div>
    );
  }

  return (
    <div>
      <div className="title-row">
        <h2>Calls Log</h2>
        <span className="muted">
          {calls.length} call{calls.length === 1 ? '' : 's'}
        </span>
      </div>

      <table className="calls-table">
        <thead>
          <tr>
            <th style={{ width: '110px' }}>Time</th>
            <th style={{ width: '180px' }}>Tool</th>
            <th>Args</th>
            <th>Result</th>
            <th style={{ width: '70px', textAlign: 'right' }}>ms</th>
            <th style={{ width: '70px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
              <td className="faint">{formatTime(c.timestamp)}</td>
              <td>{c.toolName}</td>
              <td className="muted">{truncate(c.args, 48)}</td>
              <td className="muted">
                {c.error ? (
                  <span style={{ color: 'var(--error)' }}>{truncate(c.error.message, 60)}</span>
                ) : (
                  truncate(c.result, 48)
                )}
              </td>
              <td style={{ textAlign: 'right' }}>{c.durationMs}</td>
              <td>
                {c.error ? (
                  <span className="tag tag--error">err</span>
                ) : (
                  <span className="tag tag--ok">ok</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && <CallDetailPanel call={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

const CallDetailPanel = ({ call, onClose }: { call: ToolCalledEvent; onClose: () => void }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'flex-end',
      zIndex: 50,
    }}
    onClick={onClose}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 'min(640px, 90vw)',
        background: 'var(--bg-elev)',
        borderLeft: '1px solid var(--border)',
        padding: '20px',
        overflow: 'auto',
      }}
    >
      <div className="title-row">
        <h2>{call.toolName}</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="muted mono" style={{ fontSize: 12, marginBottom: 16 }}>
        {call.timestamp} · {call.durationMs}ms
      </div>
      <div className="muted" style={{ fontSize: 11, margin: '8px 0 4px' }}>
        ARGS
      </div>
      <pre>{JSON.stringify(call.args, null, 2)}</pre>
      <div className="muted" style={{ fontSize: 11, margin: '12px 0 4px' }}>
        {call.error ? 'ERROR' : 'RESULT'}
      </div>
      <pre style={{ color: call.error ? 'var(--error)' : undefined }}>
        {call.error
          ? `${call.error.message}${call.error.phase ? ` (phase: ${call.error.phase})` : ''}`
          : JSON.stringify(call.result, null, 2)}
      </pre>
    </div>
  </div>
);
