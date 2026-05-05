import { useEffect, useState } from 'react';
import type { RuntimeEvent, ServerSnapshot, ToolCalledEvent } from '../lib/types';
import { api } from '../lib/api';
import { connectEventStream, type WsStatus } from '../lib/ws';
import { ToolsTab } from './tabs/ToolsTab';
import { CallsTab } from './tabs/CallsTab';
import { PlaygroundTab } from './tabs/PlaygroundTab';
import { SettingsTab } from './tabs/SettingsTab';

type TabId = 'tools' | 'calls' | 'playground' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'calls', label: 'Calls Log' },
  { id: 'playground', label: 'Playground' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [snapshot, setSnapshot] = useState<ServerSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [calls, setCalls] = useState<ToolCalledEvent[]>([]);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [activeTab, setActiveTab] = useState<TabId>('tools');

  // Initial config snapshot.
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      api
        .server()
        .then((s) => {
          if (!cancelled) {
            setSnapshot(s);
            setSnapshotError(null);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setSnapshotError(e instanceof Error ? e.message : String(e));
          }
        });
    };
    load();
    // Re-load on config:loaded events too — handled below.
    return () => {
      cancelled = true;
    };
  }, []);

  // WS event stream.
  useEffect(() => {
    const { close } = connectEventStream((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 1000));
      if (event.type === 'tool:called') {
        setCalls((prev) => [event, ...prev].slice(0, 500));
      }
      if (event.type === 'config:loaded') {
        // Refresh the snapshot whenever the runtime says config changed.
        // We don't fail the whole inspector if this transient fetch flakes —
        // the next config:loaded will retry — but we do surface the error.
        api
          .server()
          .then(setSnapshot)
          .catch((e: unknown) => {
            console.warn('[mcify inspector] failed to refresh snapshot', {
              error: e instanceof Error ? e.message : String(e),
            });
          });
      }
    }, setWsStatus);
    return close;
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__name">mcify</span>
          {snapshot ? (
            <span className="topbar__server">
              {snapshot.name}@{snapshot.version}
            </span>
          ) : (
            <span className="topbar__server muted">connecting…</span>
          )}
        </div>
        <div className="topbar__status">
          <span
            className={`dot ${wsStatus === 'open' ? 'dot--live' : wsStatus === 'connecting' ? '' : 'dot--off'}`}
            aria-hidden
          />
          <span>{wsStatus === 'open' ? 'live' : wsStatus}</span>
        </div>
      </header>

      <div className="layout">
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${activeTab === t.id ? 'tab--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="tab-panel">
          {snapshotError && !snapshot ? (
            <div className="empty">
              <div>Couldn't reach the mcify server.</div>
              <div className="muted" style={{ marginTop: 8 }}>
                {snapshotError}
              </div>
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Run <code>mcify dev</code> in your project, then reload this page.
              </div>
            </div>
          ) : !snapshot ? (
            <div className="empty">Loading…</div>
          ) : activeTab === 'tools' ? (
            <ToolsTab snapshot={snapshot} />
          ) : activeTab === 'calls' ? (
            <CallsTab calls={calls} />
          ) : activeTab === 'playground' ? (
            <PlaygroundTab snapshot={snapshot} />
          ) : (
            <SettingsTab snapshot={snapshot} eventsTotal={events.length} />
          )}
        </div>
      </div>
    </div>
  );
}
