import { phoneHref, type PatientContact } from '@clinic/shared';

/**
 * How to reach someone through a contact: a phone call, an email, or their Messenger chat.
 * Null when there is nothing to open (an "other" detail that is not a link): copy it instead.
 */
export function contactLink(c: Pick<PatientContact, 'type' | 'value'>): { href: string; newTab: boolean } | null {
  const v = c.value.trim();
  if (!v) return null;
  const web = /^https?:\/\//i.test(v) ? v : /^(m\.me|(www\.)?(facebook|messenger)\.com)\//i.test(v) ? `https://${v}` : null;
  switch (c.type) {
    case 'phone':
      return { href: `tel:${phoneHref(v)}`, newTab: false };
    case 'email':
      return { href: `mailto:${v}`, newTab: false };
    case 'messenger':
      return { href: web ?? `https://m.me/${encodeURIComponent(v.replace(/^@/, ''))}`, newTab: true };
    default:
      return web ? { href: web, newTab: true } : null;
  }
}
