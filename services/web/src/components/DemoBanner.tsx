import { resetDemo } from '../services/demo';

/** Shown on every screen of the demo build, so nobody mistakes it for a real clinic's records. */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="note" aria-label="Demo">
      <span>
        <strong>Demo</strong> · made-up patients, kept only in this browser.
      </span>
      <button type="button" className="link" onClick={() => void resetDemo()}>
        Reset demo
      </button>
    </div>
  );
}
