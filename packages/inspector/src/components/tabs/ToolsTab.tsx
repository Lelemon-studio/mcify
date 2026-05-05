import { useState } from 'react';
import type { ServerSnapshot } from '../../lib/types';

export const ToolsTab = ({ snapshot }: { snapshot: ServerSnapshot }) => {
  if (snapshot.tools.length === 0) {
    return (
      <div className="empty">
        No tools registered yet. Add one in <code>mcify.config.ts</code>.
      </div>
    );
  }

  return (
    <div>
      <div className="title-row">
        <h2>Tools</h2>
        <span className="muted">{snapshot.tools.length} registered</span>
      </div>
      <div className="tool-list">
        {snapshot.tools.map((t) => (
          <ToolCard key={t.name} tool={t} />
        ))}
      </div>
    </div>
  );
};

const ToolCard = ({ tool }: { tool: ServerSnapshot['tools'][number] }) => {
  const [showSchema, setShowSchema] = useState(false);
  return (
    <div className="tool-card">
      <div className="tool-card__head">
        <span className="tool-card__name">{tool.name}</span>
        <button
          className="schema-toggle"
          onClick={() => setShowSchema((v) => !v)}
          aria-label={showSchema ? 'Hide schema' : 'Show schema'}
        >
          {showSchema ? 'hide schema' : 'show schema'}
        </button>
      </div>
      <div className="tool-card__desc">{tool.description}</div>
      {showSchema && (
        <div className="tool-card__schema">
          <div className="muted" style={{ fontSize: 11, margin: '8px 0 4px' }}>
            INPUT
          </div>
          <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
          <div className="muted" style={{ fontSize: 11, margin: '12px 0 4px' }}>
            OUTPUT
          </div>
          <pre>{JSON.stringify(tool.outputSchema, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
