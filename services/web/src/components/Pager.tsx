import { pageWindow, type Page } from '../domain/paging';
import { Icon } from './Icon';

/** Previous / numbered pages with gaps / next. Renders nothing for a single page. */
export function Pager({ page, onPage, label = 'Pages' }: { page: Pick<Page<unknown>, 'page' | 'pageCount'>; onPage(n: number): void; label?: string }) {
  if (page.pageCount <= 1) return null;
  return (
    <nav className="pager" aria-label={label}>
      <button type="button" className="btn" disabled={page.page === 1} onClick={() => onPage(page.page - 1)}>
        <Icon name="back" size={18} />
        <span className="sr-only">Previous</span>
      </button>
      {pageWindow(page.page, page.pageCount).map((n, i) =>
        n === '…' ? (
          <span key={`gap${i}`} className="muted">…</span>
        ) : (
          <button type="button" key={n} className={`btn ${n === page.page ? 'on' : ''}`} aria-current={n === page.page ? 'page' : undefined} onClick={() => onPage(n)}>
            {n}
          </button>
        ),
      )}
      <button type="button" className="btn" disabled={page.page === page.pageCount} onClick={() => onPage(page.page + 1)}>
        <span className="sr-only">Next</span>
        <span className="flip"><Icon name="back" size={18} /></span>
      </button>
    </nav>
  );
}

/** "Showing 26–50 of 120 records" */
export function PageRange({ page, pageSize, noun }: { page: Page<unknown>; pageSize: number; noun: [string, string] }) {
  if (page.total === 0) return null;
  const from = (page.page - 1) * pageSize + 1;
  return (
    <p className="muted small">
      Showing {from}–{from + page.items.length - 1} of {page.total} {page.total === 1 ? noun[0] : noun[1]}
    </p>
  );
}
