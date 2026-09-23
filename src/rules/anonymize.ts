/**
 * Dataset-mode redaction. Removes the author's and mentioned people's names,
 * LinkedIn profile URLs, email addresses (keeping only the domain type) and
 * phone numbers. Names come from the DOM at save time and are never stored.
 */
import { FREE_EMAIL_DOMAINS, inDomainList } from './domains';

const EMAIL_RE = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
const PROFILE_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s)\]}>"']+/gi;
const PHONE_RE = /\+?\d[\d\s()-]{7,}\d/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function anonymize(text: string, names: string[]): string {
  let out = text
    .replace(PROFILE_RE, '[profile]')
    .replace(EMAIL_RE, (_m, domain: string) => (inDomainList(domain, FREE_EMAIL_DOMAINS) ? '[email:free]' : '[email:company]'))
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, '').length >= 8 ? '[phone]' : m));
  const parts = new Set<string>();
  for (const name of names) {
    const n = name.trim();
    if (n.length < 2) continue;
    parts.add(n);
    // Also catch "Hi, I'm Priya" when the full name is "Priya Sharma".
    for (const word of n.split(/\s+/)) if (word.length >= 3 && /^\p{Lu}/u.test(word)) parts.add(word);
  }
  for (const p of [...parts].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p)}(?![\\p{L}\\p{N}])`, 'gu'), '[name]');
  }
  return out;
}
