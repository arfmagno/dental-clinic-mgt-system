import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BarList, ColumnChart } from '../components/ReportCharts';
import { formatDate, formatMoney } from '../domain/format';
import { changePercent, PERIOD_LABEL, type Period, type Report } from '../domain/reports';
import { useReport } from '../hooks/useData';
import { useFeature } from '../services/features';

const PERIODS = Object.keys(PERIOD_LABEL) as Period[];

function Change({ report }: { report: Report }) {
  const pct = changePercent(report.collectedCents, report.previousCollectedCents);
  if (pct === null) return <span className="muted small">No payments in the previous period</span>;
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return (
    <span className={`delta ${dir} small`}>
      <span aria-hidden>{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●'}</span> {pct > 0 ? '+' : ''}{pct}% vs previous period
    </span>
  );
}

/** The KPI row, shared by the Reports page and the dashboard summary. */
export function ReportStats({ report }: { report: Report }) {
  return (
    <div className="kpis">
      <div className="kpi">
        <span className="muted small">Collected</span>
        <strong>{formatMoney(report.collectedCents)}</strong>
        <Change report={report} />
      </div>
      <div className="kpi">
        <span className="muted small">Billed</span>
        <strong>{formatMoney(report.billedCents)}</strong>
        <span className="muted small">{report.procedureCount} procedure{report.procedureCount === 1 ? '' : 's'}</span>
      </div>
      <div className="kpi">
        <span className="muted small">Outstanding today</span>
        <strong className={report.outstandingCents > 0 ? 'owed' : ''}>{formatMoney(report.outstandingCents)}</strong>
        <span className="muted small">{report.owingPatients} patient{report.owingPatients === 1 ? '' : 's'}</span>
      </div>
      <div className="kpi">
        <span className="muted small">New patients</span>
        <strong>{report.newPatients}</strong>
        <span className="muted small">registered</span>
      </div>
    </div>
  );
}

/** Reports: collections, billing and balances. An optional feature (Settings → Preferences). */
export function Reports() {
  const enabled = useFeature('reports');
  const [params, setParams] = useSearchParams();
  const period: Period = PERIODS.find((p) => p === params.get('period')) ?? '30d';
  const report = useReport(period);
  if (!enabled) return <Navigate to="/" replace />;

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <h1>Reports</h1>
          {report && <p className="muted small">{formatDate(report.from)} – {formatDate(report.to)}</p>}
        </div>
        <div className="segmented" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={p === period} onClick={() => setParams(p === '30d' ? {} : { period: p }, { replace: true })}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {report === undefined ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <ReportStats report={report} />
          <section className="card" aria-label="Collections">
            <ColumnChart title={`Collections · ${PERIOD_LABEL[period].toLowerCase()}`} buckets={report.collections} />
          </section>
          <div className="report-grid">
            <section className="card stack tight" aria-labelledby="top-title">
              <h3 id="top-title">Most done procedures</h3>
              {report.topProcedures.length === 0 ? (
                <p className="muted small">No procedures in this period.</p>
              ) : (
                <table className="table">
                  <thead><tr><th>Procedure</th><th className="right">Done</th><th className="right">Billed</th></tr></thead>
                  <tbody>
                    {report.topProcedures.map((t) => (
                      <tr key={t.type}><td>{t.type}</td><td className="right">{t.count}</td><td className="right">{formatMoney(t.billedCents)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card stack tight" aria-labelledby="methods-title">
              <h3 id="methods-title">Payment methods</h3>
              <BarList items={report.methods.map((m) => ({ label: m.label, cents: m.cents }))} empty="No payments in this period." />
            </section>
            <section className="card stack tight" aria-labelledby="aging-title">
              <div className="row between">
                <h3 id="aging-title">Unpaid balances by age</h3>
                <Link to="/transactions?view=owing" className="small strong">Settle</Link>
              </div>
              <BarList items={report.aging.map((a) => ({ label: a.label, cents: a.cents, note: `${a.count} record${a.count === 1 ? '' : 's'}` }))} empty="Nothing outstanding." />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/** Dashboard summary (only when reports are switched on). */
export function ReportSummary() {
  const report = useReport('30d');
  return (
    <section className="card stack tight report-summary" aria-labelledby="summary-title">
      <div className="row between">
        <h2 id="summary-title">Last 30 days</h2>
        <Link to="/reports" className="small strong">View reports</Link>
      </div>
      {report ? <ReportStats report={report} /> : <p className="muted">Loading…</p>}
    </section>
  );
}
