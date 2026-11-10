import { Fragment, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { nameGroup } from '@clinic/shared';
import { ageOf, formatDate, formatMoney, type PatientSummary } from '../domain/format';
import { groupStartPages, pageWindow, paginate } from '../domain/paging';
import { matchesPatient } from '../domain/search';
import { Icon } from '../components/Icon';
import { usePatientSummaries, useSearchIndex } from '../hooks/useData';

export const PAGE_SIZE = 25;
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const groupOf = (s: PatientSummary) => nameGroup(s.patient);

/** Patient list: searchable, grouped by last-name initial, paginated (page and query live in the URL). */
export function Patients() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const pageParam = Number(params.get('page') ?? '1');
  const summaries = usePatientSummaries();
  const index = useSearchIndex();
  const listTop = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => (summaries ?? []).filter((s) => matchesPatient(s.patient, index?.get(s.patient.id) ?? '', q)), [summaries, index, q]);
  const starts = useMemo(() => groupStartPages(shown, groupOf, PAGE_SIZE), [shown]);
  const page = paginate(shown, PAGE_SIZE, pageParam);

  const go = (next: { q?: string; page?: number }) => {
    const out: Record<string, string> = {};
    const nq = next.q ?? q;
    if (nq) out.q = nq;
    const np = next.page ?? 1;
    if (np > 1) out.page = String(np);
    setParams(out, { replace: next.q !== undefined });
  };
  const jump = (letter: string) => {
    go({ page: starts.get(letter) });
    requestAnimationFrame(() => document.getElementById(`group-${letter}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  // Moving to page 2+ scrolls back to the top of the list (the page number is in the URL).
  const pageNo = page.page;
  useEffect(() => {
    if (pageNo > 1) listTop.current?.scrollIntoView({ block: 'start' });
  }, [pageNo]);

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Patients</h1>
        <Link to="/patients/new" className="btn primary"><Icon name="plus" size={18} /> Add Patient</Link>
      </div>
      <input
        type="search"
        className="search"
        placeholder="Search by name, address, phone, email…"
        aria-label="Search patients"
        autoFocus={params.get('focus') === '1'}
        value={q}
        onChange={(e) => go({ q: e.target.value })}
      />
      {summaries !== undefined && shown.length > 0 && (
        <nav className="az" aria-label="Jump to letter">
          {LETTERS.map((l) => (
            <button key={l} type="button" disabled={!starts.has(l)} onClick={() => jump(l)} aria-label={l === '#' ? 'Other' : `Last names starting with ${l}`}>
              {l}
            </button>
          ))}
        </nav>
      )}
      <div ref={listTop} />
      {summaries === undefined ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="card muted">
          {summaries.length ? 'No patients match your search.' : <>No patients yet. <Link to="/patients/new">Add the first patient</Link>.</>}
        </p>
      ) : (
        <>
          <p className="muted small">
            Showing {(page.page - 1) * PAGE_SIZE + 1}–{(page.page - 1) * PAGE_SIZE + page.items.length} of {page.total} patient{page.total === 1 ? '' : 's'}
          </p>
          <ul className="plist">
            {page.items.map((s, i) => {
              const { patient, name, lastVisit, balanceCents } = s;
              const g = groupOf(s);
              const newGroup = i === 0 || groupOf(page.items[i - 1]) !== g;
              const continued = i === 0 && starts.get(g) !== page.page;
              const age = ageOf(patient.birthDate);
              return (
                <Fragment key={patient.id}>
                  {newGroup && (
                    <li className="group-head" id={`group-${g}`}>
                      {g === '#' ? 'Other' : g}{continued && <span className="muted small"> (continued)</span>}
                    </li>
                  )}
                  <li>
                    <Link to={`/patients/${patient.id}`} className="card prow">
                      <div className="avatar">{patient.photo ? <img src={patient.photo} alt="" /> : <span aria-hidden>👤</span>}</div>
                      <div className="grow">
                        <strong>{name}</strong>
                        <div className="muted small">{[age !== null && `${age} yrs`, patient.occupation].filter(Boolean).join(' · ') || 'No details yet'}</div>
                      </div>
                      <div className="right small">
                        <div className="muted">{lastVisit ? `Last visit ${formatDate(lastVisit)}` : 'No visits'}</div>
                        {balanceCents > 0 && <div className="owed">Owes {formatMoney(balanceCents)}</div>}
                      </div>
                    </Link>
                  </li>
                </Fragment>
              );
            })}
          </ul>
          {page.pageCount > 1 && (
            <nav className="pager" aria-label="Pages">
              <button className="btn" disabled={page.page === 1} onClick={() => go({ page: page.page - 1 })}><Icon name="back" size={18} /><span className="sr-only">Previous</span></button>
              {pageWindow(page.page, page.pageCount).map((n, i) =>
                n === '…' ? (
                  <span key={`gap${i}`} className="muted">…</span>
                ) : (
                  <button key={n} className={`btn ${n === page.page ? 'on' : ''}`} aria-current={n === page.page ? 'page' : undefined} onClick={() => go({ page: n })}>
                    {n}
                  </button>
                ),
              )}
              <button className="btn" disabled={page.page === page.pageCount} onClick={() => go({ page: page.page + 1 })}><span className="sr-only">Next</span><span className="flip"><Icon name="back" size={18} /></span></button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
