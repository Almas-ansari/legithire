/**
 * Domain lists. Contributors: add entries here, keep them lowercase, and add a
 * test case in tests/domains.test.ts if the match is not a plain suffix.
 *
 * A host matches an entry when it equals the domain or ends with "." + domain.
 */

export interface AtsDomain {
  domain: string;
  name: string;
  /** Optional path prefix the URL must start with. */
  path?: string;
}

/** Applicant tracking systems and trusted job boards. */
export const ATS_DOMAINS: AtsDomain[] = [
  { domain: 'greenhouse.io', name: 'Greenhouse' },
  { domain: 'lever.co', name: 'Lever' },
  { domain: 'myworkdayjobs.com', name: 'Workday' },
  { domain: 'myworkdaysite.com', name: 'Workday' },
  { domain: 'ashbyhq.com', name: 'Ashby' },
  { domain: 'smartrecruiters.com', name: 'SmartRecruiters' },
  { domain: 'workable.com', name: 'Workable' },
  { domain: 'bamboohr.com', name: 'BambooHR' },
  { domain: 'icims.com', name: 'iCIMS' },
  { domain: 'jobvite.com', name: 'Jobvite' },
  { domain: 'linkedin.com', path: '/jobs', name: 'LinkedIn Jobs' },
  { domain: 'naukri.com', name: 'Naukri' },
  { domain: 'instahyre.com', name: 'Instahyre' },
  { domain: 'wellfound.com', name: 'Wellfound' },
  { domain: 'cutshort.io', name: 'Cutshort' },
  { domain: 'zohorecruit.com', name: 'Zoho Recruit' },
  { domain: 'zohorecruit.in', name: 'Zoho Recruit' },
  { domain: 'darwinbox.in', name: 'Darwinbox' },
  { domain: 'darwinbox.com', name: 'Darwinbox' },
  { domain: 'keka.com', name: 'Keka' },
  { domain: 'freshteam.com', name: 'Freshteam' },
  { domain: 'recruitee.com', name: 'Recruitee' },
  { domain: 'teamtailor.com', name: 'Teamtailor' },
  { domain: 'breezy.hr', name: 'Breezy' },
  { domain: 'applytojob.com', name: 'JazzHR' },
  { domain: 'successfactors.com', name: 'SuccessFactors' },
  { domain: 'successfactors.eu', name: 'SuccessFactors' },
  { domain: 'taleo.net', name: 'Taleo' },
  { domain: 'personio.com', name: 'Personio' },
  { domain: 'personio.de', name: 'Personio' },
  { domain: 'workatastartup.com', name: 'Work at a Startup' },
];

export const GOOGLE_FORM_DOMAINS: AtsDomain[] = [
  { domain: 'forms.gle', name: 'Google Form' },
  { domain: 'docs.google.com', path: '/forms', name: 'Google Form' },
  { domain: 'forms.office.com', name: 'Microsoft Form' },
];

export const WHATSAPP_DOMAINS = ['wa.me', 'chat.whatsapp.com', 'api.whatsapp.com', 'whatsapp.com'];
export const TELEGRAM_DOMAINS = ['t.me', 'telegram.me', 'telegram.org', 'telegram.dog'];

export const SHORTENER_DOMAINS = [
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  'rb.gy',
  'cutt.ly',
  'shorturl.at',
  'is.gd',
  'ow.ly',
  'rebrand.ly',
  'tiny.cc',
  'shorte.st',
];

/** LinkedIn's own link wrapper. The destination is not in the DOM. */
export const OPAQUE_LINK_DOMAINS = ['lnkd.in'];

export const FREE_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.in',
  'ymail.com',
  'outlook.com',
  'outlook.in',
  'hotmail.com',
  'live.com',
  'msn.com',
  'rediffmail.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zohomail.in',
  'zohomail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
];

/** Second-level public suffixes, so "acme.co.in" yields label "acme". */
export const MULTI_PART_SUFFIXES = [
  'co.in', 'org.in', 'net.in', 'firm.in', 'gen.in', 'ind.in',
  'co.uk', 'org.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au',
  'com.sg', 'com.my', 'com.br', 'co.jp', 'co.nz', 'co.za', 'com.mx',
];

/** Subdomain or path hints that a link is a careers page. */
export const CAREERS_HINTS = ['careers', 'career', 'jobs', 'job', 'join', 'hiring', 'apply', 'work-with-us', 'opportunities'];

export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

export function findDomain(url: URL, entries: AtsDomain[]): AtsDomain | undefined {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  return entries.find((e) => hostMatches(host, e.domain) && (!e.path || path.startsWith(e.path)));
}

export function inDomainList(host: string, list: string[]): boolean {
  const h = host.toLowerCase();
  return list.some((d) => hostMatches(h, d));
}

/** "careers.acme.co.in" -> "acme". Returns null for bare suffixes. */
export function registrableLabel(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const suffix = MULTI_PART_SUFFIXES.find((s) => h.endsWith('.' + s));
  const rest = suffix ? h.slice(0, -(suffix.length + 1)) : h.slice(0, Math.max(0, h.lastIndexOf('.')));
  if (!rest) return null;
  const parts = rest.split('.');
  return parts[parts.length - 1] || null;
}
