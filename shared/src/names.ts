// Names are stored as parts; every displayed "full name" is derived here.

export interface NameParts {
  salutation: string;
  firstName: string;
  middleName: string;
  lastName: string;
}

export interface NameFormat {
  /** Include the salutation (e.g. "Dr."). Default false. */
  salutation?: boolean;
  /** full = "Maria Clara Santos", initial = "Maria C. Santos", none = "Maria Santos". Default full. */
  middle?: 'full' | 'initial' | 'none';
  /** "Santos, Maria Clara" (for sorted lists). Default false. */
  lastFirst?: boolean;
}

const initial = (s: string) => (s ? `${s.trim()[0].toUpperCase()}.` : '');

export function formatName(p: NameParts, o: NameFormat = {}): string {
  const mode = o.middle ?? 'full';
  const middle = mode === 'none' ? '' : mode === 'initial' ? p.middleName.split(/\s+/).map(initial).join(' ') : p.middleName;
  const given = [p.firstName, middle].map((s) => s.trim()).filter(Boolean).join(' ');
  const core = o.lastFirst
    ? [p.lastName.trim(), given].filter(Boolean).join(', ')
    : [given, p.lastName.trim()].filter(Boolean).join(' ');
  return [o.salutation ? p.salutation : '', core].filter(Boolean).join(' ') || '(no name)';
}

/** Case/accent-insensitive sort key: last name, then first, then middle. */
export function nameSortKey(p: NameParts): string {
  return fold(`${p.lastName}\u0000${p.firstName}\u0000${p.middleName}`);
}

/** Group heading for alphabetical lists: first letter of the last name (A–Z), otherwise "#". */
export function nameGroup(p: NameParts): string {
  const c = fold(p.lastName || p.firstName).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** Lowercase and strip accents (Ñ → n, É → e) for sorting/searching. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
