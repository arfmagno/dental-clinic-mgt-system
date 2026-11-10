export interface Page<T> {
  items: T[];
  page: number; // 1-based, clamped
  pageCount: number;
  total: number;
}

export function paginate<T>(list: T[], pageSize: number, page: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return { items: list.slice((p - 1) * pageSize, p * pageSize), page: p, pageCount, total: list.length };
}

/** For an alphabetically grouped list: group key → page number where that group starts. */
export function groupStartPages<T>(list: T[], groupOf: (item: T) => string, pageSize: number): Map<string, number> {
  const out = new Map<string, number>();
  list.forEach((item, i) => {
    const g = groupOf(item);
    if (!out.has(g)) out.set(g, Math.floor(i / pageSize) + 1);
  });
  return out;
}

/** Compact page list with gaps, e.g. [1, '…', 4, 5, 6, '…', 12]. */
export function pageWindow(page: number, pageCount: number): (number | '…')[] {
  const want = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const sorted = [...want].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}
