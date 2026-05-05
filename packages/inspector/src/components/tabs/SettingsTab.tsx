import type { ServerSnapshot } from '../../lib/types';

export const SettingsTab = ({
  snapshot,
  eventsTotal,
}: {
  snapshot: ServerSnapshot;
  eventsTotal: number;
}) => (
  <div>
    <div className="title-row">
      <h2>Settings</h2>
    </div>
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
    <p className="muted" style={{ marginTop: 24, fontSize: 12, maxWidth: 540 }}>
      Persistent settings (theme, log retention, request filters) arrive in a later release. For
      now, use <code>mcify dev --no-inspector</code> to disable the inspector entirely.
    </p>
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
