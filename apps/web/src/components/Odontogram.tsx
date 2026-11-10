import { CONDITIONS, CONDITION_COLOR, CONDITION_LABEL, toothLayout, type Condition, type Dentition } from '@clinic/shared';
import type { ToothState } from '../domain/chart';

interface Props {
  dentition: Dentition;
  chart: Map<number, Pick<ToothState, 'condition'>>;
  selected?: Set<number>;
  onToothClick?: (tooth: number) => void;
}

/** FDI odontogram. Upper arch on top, patient's right on the viewer's left (standard chart layout). */
export function Odontogram({ dentition, chart, selected, onToothClick }: Props) {
  const layout = toothLayout(dentition);
  const interactive = !!onToothClick;
  return (
    <svg className="odontogram" viewBox={`-14 0 ${layout.width + 28} ${layout.height}`} role="group" aria-label="Dental chart">
      <text x={-10} y={layout.height / 2 + 4} className="odo-side">R</text>
      <text x={layout.width + 10} y={layout.height / 2 + 4} className="odo-side" textAnchor="end">L</text>
      <line x1={layout.half + layout.gap / 2} x2={layout.half + layout.gap / 2} y1={10} y2={layout.height - 10} className="odo-mid" />
      {layout.teeth.map((t) => {
        const condition: Condition = chart.get(t.tooth)?.condition ?? 'healthy';
        const isSel = selected?.has(t.tooth);
        const cx = t.x + t.w / 2;
        const cy = t.y + t.h / 2;
        const dark = condition === 'extracted' || condition === 'impacted' || condition === 'cavity' || condition === 'filled';
        const mark = dark ? '#fff' : '#475569';
        return (
          <g
            key={t.tooth}
            className={interactive ? 'tooth interactive' : 'tooth'}
            onClick={interactive ? () => onToothClick(t.tooth) : undefined}
            onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToothClick(t.tooth)) : undefined}
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? 'button' : undefined}
            aria-label={`Tooth ${t.tooth}: ${CONDITION_LABEL[condition]}${isSel ? ', selected' : ''}`}
            aria-pressed={interactive ? !!isSel : undefined}
          >
            <rect
              x={t.x}
              y={t.y}
              width={t.w}
              height={t.h}
              rx={t.w / 3.2}
              fill={CONDITION_COLOR[condition]}
              stroke={isSel ? '#0d9488' : condition === 'crown' ? '#a16207' : '#94a3b8'}
              strokeWidth={isSel ? 3.5 : condition === 'crown' ? 3 : 1.5}
              strokeDasharray={condition === 'missing' ? '3 3' : undefined}
            />
            {(condition === 'missing' || condition === 'extracted') && (
              <path d={`M${cx - 7} ${cy - 7}L${cx + 7} ${cy + 7}M${cx + 7} ${cy - 7}L${cx - 7} ${cy + 7}`} stroke={mark} strokeWidth={2} strokeLinecap="round" />
            )}
            {condition === 'root_canal' && <path d={`M${cx} ${t.y + 6}L${cx} ${t.y + t.h - 6}`} stroke="#7c2d12" strokeWidth={3} strokeLinecap="round" />}
            {condition === 'cavity' && <circle cx={cx} cy={cy} r={4.5} fill="#7f1d1d" />}
            {condition === 'filled' && <rect x={cx - 5} y={cy - 5} width={10} height={10} rx={2} fill="#fff" />}
            {condition === 'impacted' && <path d={`M${cx - 6} ${cy - 4}L${cx + 6} ${cy - 4}L${cx} ${cy + 7}Z`} fill={mark} />}
            <text x={cx} y={t.upper ? layout.rowUpperY - 8 : layout.rowLowerY + 40 + 15} className="odo-num" textAnchor="middle">
              {t.tooth}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ConditionLegend() {
  return (
    <ul className="legend" aria-label="Condition colours">
      {CONDITIONS.map((c) => (
        <li key={c}>
          <span className="swatch" style={{ background: CONDITION_COLOR[c] }} />
          {CONDITION_LABEL[c]}
        </li>
      ))}
    </ul>
  );
}
