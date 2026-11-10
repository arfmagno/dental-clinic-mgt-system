// Citizenship is shown as a nationality ("Filipino"), not a country name ("Philippines").
// It is STORED as the ISO 3166-1 alpha-2 code of the country of citizenship (e.g. PH), because a
// code is unambiguous, language-independent and does not change with spelling ("Filipino" /
// "Filipina" / "Pilipino" all mean PH). Labels follow common English usage (GOV.UK nationality list).

export const DEFAULT_CITIZENSHIP = 'PH';

export const NATIONALITY: Readonly<Record<string, string>> = {
  AF: 'Afghan', AL: 'Albanian', DZ: 'Algerian', AD: 'Andorran', AO: 'Angolan', AG: 'Antiguan and Barbudan',
  AR: 'Argentine', AM: 'Armenian', AU: 'Australian', AT: 'Austrian', AZ: 'Azerbaijani', BS: 'Bahamian',
  BH: 'Bahraini', BD: 'Bangladeshi', BB: 'Barbadian', BY: 'Belarusian', BE: 'Belgian', BZ: 'Belizean',
  BJ: 'Beninese', BT: 'Bhutanese', BO: 'Bolivian', BA: 'Bosnian and Herzegovinian', BW: 'Botswanan',
  BR: 'Brazilian', BN: 'Bruneian', BG: 'Bulgarian', BF: 'Burkinabe', BI: 'Burundian', CV: 'Cape Verdean',
  KH: 'Cambodian', CM: 'Cameroonian', CA: 'Canadian', CF: 'Central African', TD: 'Chadian', CL: 'Chilean',
  CN: 'Chinese', CO: 'Colombian', KM: 'Comorian', CG: 'Congolese (Congo)', CD: 'Congolese (DRC)',
  CR: 'Costa Rican', CI: 'Ivorian', HR: 'Croatian', CU: 'Cuban', CY: 'Cypriot', CZ: 'Czech', DK: 'Danish',
  DJ: 'Djiboutian', DM: 'Dominican (Dominica)', DO: 'Dominican (Dominican Republic)', EC: 'Ecuadorean',
  EG: 'Egyptian', SV: 'Salvadorean', GQ: 'Equatorial Guinean', ER: 'Eritrean', EE: 'Estonian',
  SZ: 'Swazi', ET: 'Ethiopian', FJ: 'Fijian', FI: 'Finnish', FR: 'French', GA: 'Gabonese', GM: 'Gambian',
  GE: 'Georgian', DE: 'German', GH: 'Ghanaian', GR: 'Greek', GD: 'Grenadian', GT: 'Guatemalan',
  GN: 'Guinean', GW: 'Guinea-Bissauan', GY: 'Guyanese', HT: 'Haitian', HN: 'Honduran', HK: 'Hong Konger',
  HU: 'Hungarian', IS: 'Icelandic', IN: 'Indian', ID: 'Indonesian', IR: 'Iranian', IQ: 'Iraqi', IE: 'Irish',
  IL: 'Israeli', IT: 'Italian', JM: 'Jamaican', JP: 'Japanese', JO: 'Jordanian', KZ: 'Kazakh', KE: 'Kenyan',
  KI: 'Kiribatian', KP: 'North Korean', KR: 'South Korean', XK: 'Kosovan', KW: 'Kuwaiti', KG: 'Kyrgyz',
  LA: 'Lao', LV: 'Latvian', LB: 'Lebanese', LS: 'Basotho', LR: 'Liberian', LY: 'Libyan',
  LI: 'Liechtenstein citizen', LT: 'Lithuanian', LU: 'Luxembourger', MO: 'Macanese', MG: 'Malagasy',
  MW: 'Malawian', MY: 'Malaysian', MV: 'Maldivian', ML: 'Malian', MT: 'Maltese', MH: 'Marshallese',
  MR: 'Mauritanian', MU: 'Mauritian', MX: 'Mexican', FM: 'Micronesian', MD: 'Moldovan', MC: 'Monegasque',
  MN: 'Mongolian', ME: 'Montenegrin', MA: 'Moroccan', MZ: 'Mozambican', MM: 'Myanmar (Burmese)',
  NA: 'Namibian', NR: 'Nauruan', NP: 'Nepalese', NL: 'Dutch', NZ: 'New Zealander', NI: 'Nicaraguan',
  NE: 'Nigerien', NG: 'Nigerian', MK: 'North Macedonian', NO: 'Norwegian', OM: 'Omani', PK: 'Pakistani',
  PW: 'Palauan', PS: 'Palestinian', PA: 'Panamanian', PG: 'Papua New Guinean', PY: 'Paraguayan',
  PE: 'Peruvian', PH: 'Filipino', PL: 'Polish', PT: 'Portuguese', PR: 'Puerto Rican', QA: 'Qatari',
  RO: 'Romanian', RU: 'Russian', RW: 'Rwandan', KN: 'Kittitian and Nevisian', LC: 'St Lucian',
  VC: 'Vincentian', WS: 'Samoan', SM: 'Sammarinese', ST: 'São Toméan', SA: 'Saudi Arabian',
  SN: 'Senegalese', RS: 'Serbian', SC: 'Seychellois', SL: 'Sierra Leonean', SG: 'Singaporean',
  SK: 'Slovak', SI: 'Slovenian', SB: 'Solomon Islander', SO: 'Somali', ZA: 'South African',
  SS: 'South Sudanese', ES: 'Spanish', LK: 'Sri Lankan', SD: 'Sudanese', SR: 'Surinamese', SE: 'Swedish',
  CH: 'Swiss', SY: 'Syrian', TW: 'Taiwanese', TJ: 'Tajik', TZ: 'Tanzanian', TH: 'Thai', TL: 'East Timorese',
  TG: 'Togolese', TO: 'Tongan', TT: 'Trinidadian and Tobagonian', TN: 'Tunisian', TR: 'Turkish',
  TM: 'Turkmen', TV: 'Tuvaluan', UG: 'Ugandan', UA: 'Ukrainian', AE: 'Emirati', GB: 'British',
  US: 'American', UY: 'Uruguayan', UZ: 'Uzbek', VU: 'Vanuatuan', VA: 'Vatican citizen', VE: 'Venezuelan',
  VN: 'Vietnamese', YE: 'Yemeni', ZM: 'Zambian', ZW: 'Zimbabwean',
};

/** "Filipino" for PH. Unknown codes (e.g. from older data) fall back to the code itself. */
export const nationalityOf = (code: string) => (code ? NATIONALITY[code] ?? code : '');

let cache: { code: string; label: string }[] | null = null;

/** Nationalities sorted alphabetically, with Filipino first. */
export function nationalityOptions(): { code: string; label: string }[] {
  if (cache) return cache;
  cache = Object.entries(NATIONALITY)
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => (a.code === DEFAULT_CITIZENSHIP ? -1 : b.code === DEFAULT_CITIZENSHIP ? 1 : a.label.localeCompare(b.label)));
  return cache;
}

export const isNationalityCode = (v: unknown) => v === '' || (typeof v === 'string' && v in NATIONALITY);
