import { useMemo, useState, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../domain/format';
import { useActivity, type ActivityItem } from '../hooks/useData';
import { useLock } from '../hooks/useLock';
import { Icon, type IconName } from './Icon';

const KIND_LABEL: Record<ActivityItem['kind'], string> = { patient: 'Patient', procedure: 'Procedure', payment: 'Transaction', chart: 'Chart', staff: 'Staff' };
const KIND_ICON: Record<ActivityItem['kind'], IconName> = { patient: 'user', procedure: 'filePlus', payment: 'wallet', chart: 'activity', staff: 'key' };
const ACTION_LABEL: Record<ActivityItem['action'], string> = { added: 'Added', updated: 'Updated', removed: 'Removed' };
const FILTERS: { value: ActivityItem['kind'] | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'patient', label: 'Patients' },
  { value: 'procedure', label: 'Procedures' },
  { value: 'payment', label: 'Transactions' },
  { value: 'chart', label: 'Chart' },
  { value: 'staff', label: 'Staff' },
];
const PAGE = 50;

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (at: string) => new Date(at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/** Timestamps are UTC; group them by the clinic's local day. */
function dayLabel(at: string, now = new Date()): string {
  const day = localDay(new Date(at));
  if (day === localDay(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day === localDay(yesterday)) return 'Yesterday';
  return formatDate(day);
}

function ActivityRow({ a, withDate = false }: { a: ActivityItem; withDate?: boolean }) {
  // "by" is only meaningful with per-person accounts (a device that syncs).
  const { accounts } = useLock();
  return (
    <li>
      {/* One grid for every row: same-size icon tile, title, then "Kind · Action · by"; time on the title's line. */}
      <Link to={a.patientId ? `/patients/${a.patientId}` : '/settings?tab=staff'}>
        <span className={`activity-icon kind-${a.kind}`} aria-hidden><Icon name={KIND_ICON[a.kind]} size={18} /></span>
        <strong className="activity-title">{a.title}</strong>
        <span className="activity-meta muted small">
          <span className="activity-kind">{KIND_LABEL[a.kind]}</span> · {ACTION_LABEL[a.action]}{accounts && a.by && <> · by {a.by}</>}
        </span>
        <time className="activity-time muted small" dateTime={a.at}>{withDate && dayLabel(a.at) !== 'Today' ? dayLabel(a.at).replace(/, \d{4}$/, '') : timeOf(a.at)}</time>
      </Link>
    </li>
  );
}

/**
 * Staff-account changes and "by" only mean something with per-person accounts (a device that
 * syncs); an offline-only device with its one shared PIN does not list them.
 */
function useVisibleActivity() {
  const activity = useActivity();
  const { accounts } = useLock();
  return useMemo(() => (accounts ? activity : activity?.filter((a) => a.kind !== 'staff')), [activity, accounts]);
}

/** The few latest actions, for the dashboard. */
export function RecentActivity({ limit = 6 }: { limit?: number }) {
  const activity = useVisibleActivity();
  return (
    <section className="card stack tight recent-activity" aria-labelledby="recent-title">
      <div className="row between">
        <h2 id="recent-title">Recent activity</h2>
        {!!activity?.length && <Link to="/settings?tab=activity" className="small strong">View all</Link>}
      </div>
      {activity === undefined ? (
        <p className="muted">Loading…</p>
      ) : activity.length === 0 ? (
        <p className="muted pad-y">Nothing yet. <Link to="/patients/new">Add your first patient</Link> to get started.</p>
      ) : (
        <ul className="activity">
          {activity.slice(0, limit).map((a) => <ActivityRow key={a.id} a={a} withDate />)}
        </ul>
      )}
    </section>
  );
}

/** Every action, newest first, grouped by day, with filters; renders more as it scrolls. */
export function ActivityLog() {
  const activity = useVisibleActivity();
  const { accounts } = useLock();
  const [kind, setKind] = useState<ActivityItem['kind'] | ''>('');
  const [shown, setShown] = useState(PAGE);
  const filtered = useMemo(() => (activity && kind ? activity.filter((a) => a.kind === kind) : activity), [activity, kind]);

  const groups = useMemo(() => {
    const out: { day: string; items: ActivityItem[] }[] = [];
    for (const a of filtered?.slice(0, shown) ?? []) {
      const day = dayLabel(a.at);
      const last = out.at(-1);
      if (last?.day === day) last.items.push(a);
      else out.push({ day, items: [a] });
    }
    return out;
  }, [filtered, shown]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (filtered && shown < filtered.length && el.scrollTop + el.clientHeight > el.scrollHeight - 200) setShown((n) => n + PAGE);
  };

  return (
    <section className="card activity-panel" aria-labelledby="activity-title">
      <div className="activity-head">
        <h2 id="activity-title">Activity log</h2>
        {filtered && <span className="muted small">{filtered.length} {filtered.length === 1 ? 'action' : 'actions'}</span>}
      </div>
      <div className="activity-filter" role="group" aria-label="Show">
        {FILTERS.filter((f) => accounts || f.value !== 'staff').map((f) => (
          <button key={f.value} type="button" className="chip" aria-pressed={kind === f.value} onClick={() => (setKind(f.value), setShown(PAGE))}>{f.label}</button>
        ))}
      </div>
      <div className="activity-scroll" onScroll={onScroll} tabIndex={0} aria-label="All actions">
        {filtered === undefined ? (
          <p className="muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="muted pad-y">{activity?.length ? 'Nothing of this kind yet.' : 'Nothing yet.'}</p>
        ) : (
          <>
            {groups.map((g) => (
              <div key={g.day} className="activity-day">
                <h3 className="activity-date">{g.day}</h3>
                <ul className="activity">{g.items.map((a) => <ActivityRow key={a.id} a={a} />)}</ul>
              </div>
            ))}
            {shown < filtered.length && (
              <button type="button" className="btn sm block" onClick={() => setShown((n) => n + PAGE)}>Show more ({filtered.length - shown} older)</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
