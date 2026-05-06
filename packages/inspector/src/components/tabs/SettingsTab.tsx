import type { ServerSnapshot } from '../../lib/types';
import type { InspectorSettings, ThemePref } from '../../lib/settings';

interface SettingsTabProps {
  snapshot: ServerSnapshot;
  eventsTotal: number;
  settings: InspectorSettings;
  onChange: (next: Partial<InspectorSettings>) => void;
  onReset: () => void;
}

export const SettingsTab = ({
  snapshot,
  eventsTotal,
  settings,
  onChange,
  onReset,
}: SettingsTabProps) => (
  <div>
    <div className="title-row">
      <h2>Settings</h2>
      <button onClick={onReset}>Reset to defaults</button>
    </div>

    <h3 style={{ fontSize: 13, marginTop: 8, marginBottom: 8 }}>Server</h3>
    <table style={{ width: 'auto', fontFamily: 'var(--mono)', fontSize: 13 }}>
      <tbody>
        <Row label="Server" value={`${snapshot.name}@${snapshot.version}`} />
        <Row label="Runtime" value={`mcify ${snapshot.runtimeVersion}`} />
        <Row label="Tools" value={String(snapshot.tools.length)} />
        <Row label="Resources" value={String(snapshot.resources.length)} />
        <Row label="Prompts" value={String(snapshot.prompts.length)} />
        <Row label="Events seen" value={String(eventsTotal)} />
      </tbody>
    </table>

    <h3 style={{ fontSize: 13, marginTop: 28, marginBottom: 8 }}>Appearance</h3>
    <div className="settings-row">
      <label htmlFor="theme">Theme</label>
      <select
        id="theme"
        value={settings.theme}
        onChange={(e) => onChange({ theme: e.target.value as ThemePref })}
        style={{ minWidth: 160 }}
      >
        <option value="auto">Auto (system)</option>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>
    </div>

    <h3 style={{ fontSize: 13, marginTop: 28, marginBottom: 8 }}>Log retention</h3>
    <p className="muted" style={{ fontSize: 12, maxWidth: 540, marginTop: 0 }}>
      Older entries are dropped from the in-memory ring buffer once the cap is reached. Storage is
      cleared on refresh — these are window-local.
    </p>
    <div className="settings-row">
      <label htmlFor="maxCalls">Max calls in log</label>
      <input
        id="maxCalls"
        type="number"
        min={1}
        max={100000}
        step={50}
        value={settings.maxCalls}
        onChange={(e) => {
          const next = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(next) && next > 0) onChange({ maxCalls: next });
        }}
        style={{ width: 120 }}
      />
    </div>
    <div className="settings-row">
      <label htmlFor="maxEvents">Max events in memory</label>
      <input
        id="maxEvents"
        type="number"
        min={1}
        max={100000}
        step={100}
        value={settings.maxEvents}
        onChange={(e) => {
          const next = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(next) && next > 0) onChange({ maxEvents: next });
        }}
        style={{ width: 120 }}
      />
    </div>
  </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <tr>
    <td className="muted" style={{ padding: '4px 16px 4px 0', fontSize: 11 }}>
      {label.toUpperCase()}
    </td>
    <td style={{ padding: '4px 0' }}>{value}</td>
  </tr>
);
