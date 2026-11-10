import {
  CONDITIONS,
  CONDITION_COLOR,
  CONDITION_LABEL,
  SHAPE_H,
  SHAPE_W,
  toothInfo,
  toothLayout,
  toothShape,
  type Condition,
  type Dentition,
} from '@clinic/shared';
import type { ToothState } from '../domain/chart';

interface Props {
  dentition: Dentition;
  chart: Map<number, Pick<ToothState, 'condition'>>;
  selected?: Set<number>;
  onToothClick?: (tooth: number) => void;
}

/**
 * FDI dental chart with anatomically shaped teeth (crown + roots). Upper arch on top with roots
 * pointing up; lower arch mirrored. Patient's right is on the viewer's left (standard layout).
 */
export function Odontogram({ dentition, chart, selected, onToothClick }: Props) {
  const L = toothLayout(dentition);
  const interactive = !!onToothClick;
  const midX = L.half + L.gap / 2;

  return (
    <svg className="odontogram" viewBox={`-16 0 ${L.width + 32} ${L.height}`} role="group" aria-label={`${dentition === 'permanent' ? 'Adult' : 'Child'} dental chart`}>
      <line x1={midX} x2={midX} y1={8} y2={L.height - 8} className="odo-mid" />
      <line x1={0} x2={L.width} y1={L.occlusalY} y2={L.occlusalY} className="odo-mid" />
      <text x={-12} y={L.occlusalY + 4} className="odo-side">R</text>
      <text x={L.width + 12} y={L.occlusalY + 4} className="odo-side" textAnchor="end">L</text>

      {L.teeth.map((t) => {
        const condition: Condition = chart.get(t.tooth)?.condition ?? 'healthy';
        const isSel = !!selected?.has(t.tooth);
        const shape = toothShape(t.tooth);
        const sx = t.w / SHAPE_W;
        const sy = t.h / SHAPE_H;
        // Upper teeth as drawn; lower teeth mirrored vertically so crowns face the bite line.
        const place = t.upper ? `translate(${t.x} ${t.y}) scale(${sx} ${sy})` : `translate(${t.x} ${t.y + t.h}) scale(${sx} ${-sy})`;
        const tilt = condition === 'impacted' ? 'rotate(22 15 40)' : undefined;
        const name = toothInfo(t.tooth)?.name ?? '';
        return (
          <g
            key={t.tooth}
            className={`tooth c-${condition}${interactive ? ' interactive' : ''}${isSel ? ' selected' : ''}`}
            onClick={interactive ? () => onToothClick(t.tooth) : undefined}
            onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToothClick(t.tooth)) : undefined}
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? 'button' : 'img'}
            aria-label={`Tooth ${t.tooth}: ${CONDITION_LABEL[condition]}${isSel ? ', selected' : ''}`}
            aria-pressed={interactive ? isSel : undefined}
          >
            <title>{`${t.tooth} · ${name} · ${CONDITION_LABEL[condition]}`}</title>
            {/* generous hit/selection area */}
            <rect className="tooth-hit" x={t.x - 4} y={t.y - 4} width={t.w + 8} height={t.h + 8} rx={8} />
            <g transform={place}>
              <g transform={tilt} className="tooth-body">
                {shape.roots.map((d, i) => <path key={i} d={d} className="root" vectorEffect="non-scaling-stroke" />)}
                <path d={shape.crown} className="crown" vectorEffect="non-scaling-stroke" />
                {condition === 'cavity' && (
                  <>
                    <circle cx={13} cy={45} r={3.6} className="decay" />
                    <circle cx={18.5} cy={50} r={2.2} className="decay" />
                  </>
                )}
                {condition === 'filled' && <rect x={9} y={39} width={12} height={10} rx={3} className="filling" />}
                {condition === 'root_canal' && shape.canals.map((d, i) => <path key={i} d={d} className="canal" vectorEffect="non-scaling-stroke" />)}
                {condition === 'extracted' && <path d="M5 34 L25 60 M25 34 L5 60" className="cross" vectorEffect="non-scaling-stroke" />}
              </g>
            </g>
            <text x={t.x + t.w / 2} y={t.upper ? L.labelUpperY : L.labelLowerY} className="odo-num" textAnchor="middle">
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
    <ul className="legend" aria-label="Condition key">
      {CONDITIONS.map((c) => (
        <li key={c}>
          <span className={`swatch s-${c}`} style={{ background: CONDITION_COLOR[c] }} />
          {CONDITION_LABEL[c]}
        </li>
      ))}
    </ul>
  );
}
