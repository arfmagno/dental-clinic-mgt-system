import { chartsFor, type DentalClassification } from '@clinic/shared';
import type { ToothState } from '../domain/chart';
import { Odontogram } from './Odontogram';

interface Props {
  classification: DentalClassification;
  chart: Map<number, Pick<ToothState, 'condition'>>;
  selected?: Set<number>;
  onToothClick?: (tooth: number) => void;
}

/** Only the chart(s) for the patient's classification: pediatric, adult, or both for mixed dentition. */
export function DentalChart({ classification, ...rest }: Props) {
  const charts = chartsFor(classification);
  return (
    <div className="charts">
      {charts.map((d) => (
        <figure key={d} className="chart-fig">
          {charts.length > 1 && <figcaption>{d === 'primary' ? 'Primary teeth' : 'Permanent teeth'}</figcaption>}
          <Odontogram dentition={d} {...rest} />
        </figure>
      ))}
    </div>
  );
}
