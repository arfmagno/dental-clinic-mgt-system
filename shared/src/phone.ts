// Phone numbers are stored in contact.value as "+<country code> <national number>", e.g. "+63 917 123 4567".
// Older rows without a "+" prefix are read as Philippine numbers.

import { DEFAULT_COUNTRY } from './countries.js';

/** ITU calling code per ISO 3166-1 alpha-2 country (territories sharing +1 / +7 / +44 etc. included). */
const DIAL = `AD376 AE971 AF93 AG1 AI1 AL355 AM374 AO244 AR54 AS1 AT43 AU61 AW297 AX358 AZ994 BA387 BB1 BD880 BE32 BF226 BG359
BH973 BI257 BJ229 BL590 BM1 BN673 BO591 BQ599 BR55 BS1 BT975 BW267 BY375 BZ501 CA1 CC61 CD243 CF236 CG242 CH41 CI225 CK682
CL56 CM237 CN86 CO57 CR506 CU53 CV238 CW599 CX61 CY357 CZ420 DE49 DJ253 DK45 DM1 DO1 DZ213 EC593 EE372 EG20 EH212 ER291 ES34
ET251 FI358 FJ679 FK500 FM691 FO298 FR33 GA241 GB44 GD1 GE995 GF594 GG44 GH233 GI350 GL299 GM220 GN224 GP590 GQ240 GR30 GT502
GU1 GW245 GY592 HK852 HN504 HR385 HT509 HU36 ID62 IE353 IL972 IM44 IN91 IO246 IQ964 IR98 IS354 IT39 JE44 JM1 JO962 JP81 KE254
KG996 KH855 KI686 KM269 KN1 KP850 KR82 KW965 KY1 KZ7 LA856 LB961 LC1 LI423 LK94 LR231 LS266 LT370 LU352 LV371 LY218 MA212 MC377
MD373 ME382 MF590 MG261 MH692 MK389 ML223 MM95 MN976 MO853 MP1 MQ596 MR222 MS1 MT356 MU230 MV960 MW265 MX52 MY60 MZ258 NA264
NC687 NE227 NF672 NG234 NI505 NL31 NO47 NP977 NR674 NU683 NZ64 OM968 PA507 PE51 PF689 PG675 PH63 PK92 PL48 PM508 PR1 PS970
PT351 PW680 PY595 QA974 RE262 RO40 RS381 RU7 RW250 SA966 SB677 SC248 SD249 SE46 SG65 SH290 SI386 SJ47 SK421 SL232 SM378 SN221
SO252 SR597 SS211 ST239 SV503 SX1 SY963 SZ268 TC1 TD235 TG228 TH66 TJ992 TK690 TL670 TM993 TN216 TO676 TR90 TT1 TV688 TW886
TZ255 UA380 UG256 US1 UY598 UZ998 VA39 VC1 VE58 VG1 VI1 VN84 VU678 WF681 WS685 XK383 YE967 YT262 ZA27 ZM260 ZW263`;

export const DIAL_CODES: Readonly<Record<string, string>> = Object.fromEntries(
  DIAL.split(/\s+/).map((e) => [e.slice(0, 2), e.slice(2)]),
);

/**
 * For a calling code shared by several countries, the one a number is read as when only the code is
 * known (e.g. +1 → US, +44 → GB, +7 → RU).
 */
const MAIN: Record<string, string> = { '1': 'US', '7': 'RU', '44': 'GB', '47': 'NO', '61': 'AU', '212': 'MA', '262': 'RE', '290': 'SH', '358': 'FI', '39': 'IT', '590': 'GP', '599': 'CW' };

/** Flag emoji for a country code (two regional-indicator letters). */
export const flagOf = (code: string) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');

export interface PhoneParts {
  country: string; // ISO alpha-2
  national: string; // as typed, without the country code
}

/** Splits a stored phone value. `hint` keeps the country chosen in the form when several share a code. */
export function parsePhone(value: string, hint?: string): PhoneParts {
  const v = value.trimStart(); // trailing spaces are kept while typing
  const m = /^\+(\d+)(.*)$/s.exec(v);
  if (!m) return { country: hint ?? DEFAULT_COUNTRY, national: v.replace(/^0(?=\d)/, '') };
  const pick = (code: string) => {
    const countries = Object.keys(DIAL_CODES).filter((c) => DIAL_CODES[c] === code);
    return countries.length ? (hint && countries.includes(hint) ? hint : (MAIN[code] ?? countries[0])) : null;
  };
  // "+63 917…": the digits before the first space are the code; "+63917…": the longest code that fits
  for (let len = Math.min(4, m[1].length); len >= 1; len--) {
    if (/^\s/.test(m[2]) && len !== m[1].length && pick(m[1])) continue;
    const country = pick(m[1].slice(0, len));
    if (country) return { country, national: (m[1].slice(len) + m[2]).trimStart() };
  }
  return { country: hint ?? DEFAULT_COUNTRY, national: v };
}

/** "+63 917 123 4567" from a country and a national number (a leading trunk 0 is dropped). */
export function formatPhone(country: string, national: string): string {
  const n = national.trimStart().replace(/^0(?=\d)/, '');
  if (!n.trim()) return '';
  return `+${DIAL_CODES[country] ?? DIAL_CODES[DEFAULT_COUNTRY]} ${n}`;
}

/** Digits-only form for tel: and sms: links, e.g. "+639171234567". */
export function phoneHref(value: string): string {
  const { country, national } = parsePhone(value);
  return `+${DIAL_CODES[country]}${national.replace(/\D/g, '')}`;
}
