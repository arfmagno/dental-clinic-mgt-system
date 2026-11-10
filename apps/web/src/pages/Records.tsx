import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { balanceCents } from '@clinic/shared';
import { formatDate, formatMoney, formatTime } from '../domain/format';
import { useAllProcedures, type ProcedureRow } from '../hooks/useData';

type SortKey = 'date' | 'patient' | 'type' | 'cost' | 'paid' | 'balance';

const sorters: Record<SortKey, (r: ProcedureRow) => string | number> = {
  date: (r) => `${r.procedure.date}${r.procedure.time}`,
  patient: (r) => r.patientName.toLowerCase(),
  type: (r) => r.procedure.type.toLowerCase(),
  cost: (r) => r.procedure.costCents,
  paid: (r) => r.procedure.paidCents,
  balance: (r) => balanceCents(r.procedure),
};

const columns: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'date', label: 'Date' },
  { key: 'patient', label: 'Patient' },
  { key: 'type', label: 'Procedure' },
  { key: 'cost', label: 'Cost', right: true },
  { key: 'paid', label: 'Paid', right: true },
  { key: 'balance', label: 'Balance', right: true },
];

export function Records() {
  const rows = useAllProcedures();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [filter, setFilter] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(false);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = (rows ?? []).filter(
      (r) => (!f || `${r.patientName} ${r.procedure.type} ${r.procedure.remarks}`.toLowerCase().includes(f)) && (!onlyOwing || balanceCents(r.procedure) > 0),
    );
    const get = sorters[sort.key];
    return list.sort((a, b) => {
      const x = get(a), y = get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, filter, onlyOwing, sort]);

  const totals = shown.reduce((t, r) => ({ cost: t.cost + r.procedure.costCents, paid: t.paid + r.procedure.paidCents }), { cost: 0, paid: 0 });
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'date' ? -1 : 1 }));

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Records</h1>
        <Link to="/procedures/new" className="btn primary">+ Add procedure</Link>
      </div>
      <div className="row wrap">
        <input type="search" className="search grow" placeholder="Filter by patient, procedure, remarks…" aria-label="Filter records" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="switch"><input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} /><span>Unpaid only</span></label>
      </div>

      {rows === undefined ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.right ? 'right' : ''} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    <button className="th-btn" onClick={() => toggle(c.key)}>
                      {c.label} <span aria-hidden>{sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={6} className="muted pad">No procedures found.</td></tr>
              )}
              {shown.map(({ procedure: p, patientName }) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}<div className="muted small">{formatTime(p.time)}</div></td>
                  <td><Link to={`/patients/${p.patientId}`}>{patientName}</Link></td>
                  <td>{p.type}{p.remarks && <div className="muted small clamp">{p.remarks}</div>}</td>
                  <td className="right">{formatMoney(p.costCents)}</td>
                  <td className="right">{formatMoney(p.paidCents)}</td>
                  <td className={`right ${balanceCents(p) > 0 ? 'owed' : ''}`}>{formatMoney(balanceCents(p))}</td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3}>{shown.length} procedure{shown.length === 1 ? '' : 's'}</td>
                  <td className="right">{formatMoney(totals.cost)}</td>
                  <td className="right">{formatMoney(totals.paid)}</td>
                  <td className="right">{formatMoney(totals.cost - totals.paid)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
