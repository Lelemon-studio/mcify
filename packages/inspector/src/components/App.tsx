import { useEffect, useRef, useState } from 'react';
import type { RuntimeEvent, ServerSnapshot, ToolCalledEvent } from '../lib/types';
import { api } from '../lib/api';
import { useInspectorSettings } from '../lib/settings';
import { connectEventStream, type WsStatus } from '../lib/ws';
import { ToolsTab } from './tabs/ToolsTab';
import { CallsTab } from './tabs/CallsTab';
import { PlaygroundTab } from './tabs/PlaygroundTab';
import { ChatTab } from './tabs/ChatTab';
import { SettingsTab } from './tabs/SettingsTab';

type TabId = 'tools' | 'calls' | 'playground' | 'chat' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'calls', label: 'Calls Log' },
  { id: 'playground', label: 'Playground' },
  { id: 'chat', label: 'Chat' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [snapshot, setSnapshot] = useState<ServerSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [calls, setCalls] = useState<ToolCalledEvent[]>([]);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [activeTab, setActiveTab] = useState<TabId>('tools');
  const { settings, setSettings, reset } = useInspectorSettings();

  // The WS callback below captures `settings` once. Mirroring it into a ref
  // keeps the latest retention thresholds visible from inside that callback
  // without forcing a reconnect on every settings change.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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
      const limits = settingsRef.current;
      setEvents((prev) => [event, ...prev].slice(0, limits.maxEvents));
      if (event.type === 'tool:called') {
        setCalls((prev) => [event, ...prev].slice(0, limits.maxCalls));
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
    // The retention slices are applied on every event push above; we
    // intentionally don't reconnect when those numbers change.
  }, []);

  // When the user lowers the retention thresholds, trim the existing
  // buffers so the change is visible immediately rather than only on
  // the next event.
  useEffect(() => {
    setEvents((prev) =>
      prev.length > settings.maxEvents ? prev.slice(0, settings.maxEvents) : prev,
    );
    setCalls((prev) => (prev.length > settings.maxCalls ? prev.slice(0, settings.maxCalls) : prev));
  }, [settings.maxEvents, settings.maxCalls]);

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
          ) : activeTab === 'chat' ? (
            <ChatTab snapshot={snapshot} />
          ) : (
            <SettingsTab
              snapshot={snapshot}
              eventsTotal={events.length}
              settings={settings}
              onChange={setSettings}
              onReset={reset}
            />
          )}
        </div>
      </div>
    </div>
  );
}
