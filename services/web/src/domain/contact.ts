import { phoneHref, type PatientContact } from '@clinic/shared';

/**
 * How to reach someone through a contact: a phone call, an email, or their Messenger chat.
 * Null when there is nothing to open (an "other" detail that is not a link): copy it instead.
 */
export function contactLink(c: Pick<PatientContact, 'type' | 'value'>): { href: string; newTab: boolean } | null {
  const v = c.value.trim();
  if (!v) return null;
  const web = /^https?:\/\//i.test(v) ? v : /^(m\.me|(www\.)?(facebook|messenger)\.com)\//i.test(v) ? `https://${v}` : null;
  // A Messenger contact may only lead to Messenger or Facebook, never to an arbitrary site.
  const messenger = web && /^https:\/\/(m\.me|(www\.|m\.)?(facebook|messenger)\.com)\//i.test(web) ? web : null;
  switch (c.type) {
    case 'phone':
      return { href: `tel:${phoneHref(v)}`, newTab: false };
    case 'email':
      // a plain address only, so no extra mail headers (?bcc=…) can ride along
      return /^[^\s@?&#]+@[^\s@?&#]+$/.test(v) ? { href: `mailto:${v}`, newTab: false } : null;
    case 'messenger':
      return messenger ? { href: messenger, newTab: true } : web ? null : { href: `https://m.me/${encodeURIComponent(v.replace(/^@/, ''))}`, newTab: true };
    default:
      return web ? { href: web, newTab: true } : null;
  }
}
