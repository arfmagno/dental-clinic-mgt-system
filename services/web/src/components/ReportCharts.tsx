import { useEffect, useId, useRef, useState } from 'react';
import type { Bucket } from '../domain/reports';
import { formatMoney } from '../domain/format';

/** ₱1.2k / ₱35k / ₱1.4M for axis labels; full amounts are in tooltips and tables. */
export function compactMoney(cents: number): string {
  const v = cents / 100;
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `₱${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `₱${Math.round(v)}`;
}

/** Round axis maximum with three even steps (e.g. 0, 5k, 10k, 15k). */
function niceMax(max: number): number {
  if (max <= 0) return 100_00;
  const step = max / 3;
  const mag = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step)!;
  return nice * 3;
}

const H = 220;

/** The plot is drawn at its real width so text stays readable on phones (no scaled-down SVG). */
function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
const PAD = { top: 12, right: 8, bottom: 26, left: 48 };

/**
 * Single-series column chart (one hue, no legend: the card title names it). Thin columns with
 * rounded tops anchored to the baseline, a recessive grid, a hover/focus tooltip, and a table view
 * with the exact numbers.
 */
export function ColumnChart({ title, buckets }: { title: string; buckets: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  const [plotRef, W] = useWidth();
  const max = niceMax(Math.max(...buckets.map((b) => b.cents)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / buckets.length;
  const barW = Math.max(3, Math.min(28, slot * 0.6));
  const y = (cents: number) => PAD.top + plotH - (cents / max) * plotH;
  const labelEvery = Math.ceil(buckets.length / Math.max(3, Math.floor(plotW / 64)));
  const total = buckets.reduce((s, b) => s + b.cents, 0);
  const active = hover === null ? null : buckets[hover];

  return (
    <div className="chart">
      <div className="row between wrap">
        <h3 id={`${id}-t`}>{title}</h3>
        <button type="button" className="link small" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {asTable ? (
        <div className="table-wrap chart-table">
          <table className="table">
            <thead><tr><th>Period</th><th className="right">Collected</th></tr></thead>
            <tbody>
              {buckets.map((b) => <tr key={b.key}><td>{b.title}</td><td className="right">{formatMoney(b.cents)}</td></tr>)}
            </tbody>
            <tfoot><tr><td>Total</td><td className="right">{formatMoney(total)}</td></tr></tfoot>
          </table>
        </div>
      ) : (
        <div className="chart-plot" ref={plotRef} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
            <desc id={`${id}-d`}>{`Total ${formatMoney(total)}. Use "Show table" for every value.`}</desc>
            {[0, 1, 2, 3].map((i) => {
              const v = (max / 3) * i;
              return (
                <g key={i} className="chart-grid">
                  <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
                  <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end">{compactMoney(v)}</text>
                </g>
              );
            })}
            {buckets.map((b, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              const h = Math.max(0, y(0) - y(b.cents));
              const r = Math.min(4, barW / 2, h);
              const x0 = cx - barW / 2;
              const top = y(0) - h;
              return (
                <g key={b.key}>
                  {h > 0 && (
                    <path
                      className={`chart-bar${hover === i ? ' on' : ''}`}
                      d={`M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${y(0)} Z`}
                    />
                  )}
                  {/* hit target: the whole column slot, larger than the mark */}
                  <rect className="chart-hit" x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} onMouseEnter={() => setHover(i)} />
                  {i % labelEvery === 0 && (
                    <text className="chart-x" x={cx} y={H - 8} textAnchor="middle">{b.label}</text>
                  )}
                </g>
              );
            })}
            <line className="chart-base" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
          </svg>
          {active && hover !== null && (
            <div className="chart-tip" style={{ left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%` }} role="status">
              <span className="muted small">{active.title}</span>
              <strong>{formatMoney(active.cents)}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars with the value written beside each: identity is the label, never colour alone. */
export function BarList({ items, empty }: { items: { label: string; cents: number; note?: string }[]; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i.cents));
  if (items.every((i) => i.cents === 0)) return <p className="muted small">{empty}</p>;
  return (
    <ul className="bar-list">
      {items.map((i) => (
        <li key={i.label}>
          <div className="row between">
            <span>{i.label}{i.note && <span className="muted small"> · {i.note}</span>}</span>
            <strong>{formatMoney(i.cents)}</strong>
          </div>
          <div className="bar-track" aria-hidden><div className="bar-fill" style={{ width: `${(i.cents / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
