// Country list for citizenship and addresses. Stored as ISO 3166-1 alpha-2 codes; display names
// come from the runtime's Intl data, so no large list is shipped and names follow the locale.

export const DEFAULT_COUNTRY = 'PH';

// Codes that Intl names but that are not countries/territories a person holds citizenship of.
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'ZZ', 'QO', 'XA', 'XB', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA']);

let cache: { code: string; name: string }[] | null = null;

export function countryName(code: string, locale = 'en'): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** All countries sorted by name, with the Philippines first. */
export function countryOptions(locale = 'en'): { code: string; name: string }[] {
  if (cache) return cache;
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const list: { code: string; name: string }[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        continue;
      }
      if (name && name !== code) list.push({ code, name });
    }
  }
  list.sort((x, y) => (x.code === DEFAULT_COUNTRY ? -1 : y.code === DEFAULT_COUNTRY ? 1 : x.name.localeCompare(y.name)));
  cache = list;
  return list;
}

export const isCountryCode = (v: unknown) => v === '' || (typeof v === 'string' && /^[A-Z]{2}$/.test(v));
