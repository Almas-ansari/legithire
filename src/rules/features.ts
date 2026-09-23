import type { Features, PostData, Specificity } from '../types';
import {
  ATS_DOMAINS,
  CAREERS_HINTS,
  FREE_EMAIL_DOMAINS,
  GOOGLE_FORM_DOMAINS,
  OPAQUE_LINK_DOMAINS,
  SHORTENER_DOMAINS,
  TELEGRAM_DOMAINS,
  WHATSAPP_DOMAINS,
  findDomain,
  hostMatches,
  inDomainList,
  registrableLabel,
} from './domains';
import {
  BAIT_PHRASES,
  DM_PHRASES,
  EXPERIENCE_PATTERNS,
  HIRING_KEYWORDS,
  JOB_CONTEXT_WORDS,
  LOCATION_TERMS,
  NOT_HIRING_PHRASES,
  PAY_CLAIM_PATTERNS,
  ROLE_TERMS,
  SALARY_PATTERNS,
  SCAM_PHRASES,
  SEEKER_PHRASES,
  TECH_TERMS,
  WEAK_BAIT_WORDS,
} from './phrases';
import { findPhrases, flatten, labelInTokens, tokens } from './text';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|co|in|org|net|me|ly|gl|app|dev|ai|jobs|hr)\/[^\s<>"')]*/gi;

const COMPANY_STOPWORDS = new Set([
  'we', 'our', 'the', 'a', 'an', 'i', 'my', 'this', 'that', 'us', 'you', 'your', 'hiring',
  'remote', 'team', 'job', 'jobs', 'role', 'position', 'linkedin', 'hr', 'dm', 'apply',
  'location', 'experience', 'hello', 'hi', 'dear', 'all', 'please', 'immediate',
]);

/** Best-effort company names ("Acme", "Acme Labs") from phrasing like "at Acme" / "Acme is hiring". */
export function companyCandidates(text: string): string[] {
  const name = String.raw`([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,2})`;
  const patterns = [
    new RegExp(String.raw`(?:\b[Aa]t|@|\b[Jj]oin(?:ing)?|\b[Ww]ith)\s*@?\s*` + name, 'g'),
    new RegExp(name + String.raw`\s+is\s+(?:hiring|looking|expanding|growing)`, 'g'),
  ];
  const out = new Set<string>();
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const words = m[1]!.replace(/[.'-]+$/, '').split(/\s+/);
      while (words.length && COMPANY_STOPWORDS.has(words[0]!.toLowerCase())) words.shift();
      const candidate = words.join(' ');
      if (candidate.length >= 2) out.add(candidate);
    }
  }
  return [...out];
}

function parseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed) || !trimmed.includes('.')) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    // Unwrap LinkedIn's redirect wrapper; the real URL is in the query string.
    if (hostMatches(url.hostname, 'linkedin.com') && /^\/(redir\/redirect|safety\/go)/.test(url.pathname)) {
      const inner = url.searchParams.get('url');
      if (inner) return parseUrl(inner);
    }
    return url;
  } catch {
    return null;
  }
}

/** All distinct URLs from link hrefs, link display text and bare URLs in the text. */
function collectUrls(post: PostData): URL[] {
  const raws = [
    ...post.links.flatMap((l) => [l.href, l.text]),
    ...(post.text.match(URL_RE) ?? []),
  ];
  const seen = new Set<string>();
  const urls: URL[] = [];
  for (const raw of raws) {
    const url = parseUrl(raw);
    if (!url) continue;
    const key = url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

function specificity(text: string, flat: string): Specificity {
  const s = {
    roleTitle: findPhrases(flat, ROLE_TERMS).length > 0,
    experience: EXPERIENCE_PATTERNS.some((re) => re.test(text)),
    techStack: findPhrases(flat, TECH_TERMS).length > 0,
    location: findPhrases(flat, LOCATION_TERMS).length > 0,
    salary: SALARY_PATTERNS.some((re) => re.test(text)),
  };
  const score = Object.values(s).filter(Boolean).length;
  return { ...s, score };
}

function isCareersLink(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const subdomains = host.split('.').slice(0, -2);
  const segments = url.pathname.toLowerCase().split(/[/_.]+/).filter(Boolean);
  return CAREERS_HINTS.some((h) => subdomains.includes(h) || segments.includes(h));
}

export function extractFeatures(post: PostData): Features {
  const text = post.text;
  const flat = flatten(text);

  // Company matching must ignore the URLs and emails themselves, otherwise
  // "jobs@acme.com" would always "match" Acme.
  const textSansContacts = text.replace(EMAIL_RE, ' ').replace(URL_RE, ' ');
  const textTokens = tokens(flatten(textSansContacts));
  const headlineFlat = flatten(post.authorHeadline);
  const headlineTokens = tokens(headlineFlat);
  const labelMatchesCompany = (label: string | null) =>
    !!label && label.length >= 3 && (labelInTokens(label, textTokens) || labelInTokens(label, headlineTokens));

  const atsNames = new Set<string>();
  let careersPage = false;
  let googleForm = false;
  let opaqueLinks = 0;
  let shortenerLinks = 0;
  let whatsapp = false;
  let telegram = false;
  let externalLinks = 0;
  let companyDomainInHeadline = false;

  for (const url of collectUrls(post)) {
    const host = url.hostname.toLowerCase();
    const ats = findDomain(url, ATS_DOMAINS);
    if (ats) {
      atsNames.add(ats.name);
      externalLinks++;
      continue;
    }
    if (hostMatches(host, 'linkedin.com')) continue; // profiles, hashtags, company pages
    externalLinks++;
    if (findDomain(url, GOOGLE_FORM_DOMAINS)) googleForm = true;
    else if (inDomainList(host, WHATSAPP_DOMAINS)) whatsapp = true;
    else if (inDomainList(host, TELEGRAM_DOMAINS)) telegram = true;
    else if (inDomainList(host, OPAQUE_LINK_DOMAINS)) opaqueLinks++;
    else if (inDomainList(host, SHORTENER_DOMAINS)) shortenerLinks++;
    else if (isCareersLink(url)) {
      const label = registrableLabel(host);
      if (labelMatchesCompany(label)) {
        careersPage = true;
        if (label && labelInTokens(label, headlineTokens)) companyDomainInHeadline = true;
      }
    }
  }

  if (findPhrases(flat, ['whatsapp', 'whats app']).length) whatsapp = true;
  if (findPhrases(flat, ['telegram']).length) telegram = true;

  const emailDomains = new Set(
    [...post.emails, ...(text.match(EMAIL_RE) ?? [])].map((e) => e.split('@')[1]!.toLowerCase()),
  );
  let corporateEmail = false;
  let corporateEmailMatchesCompany = false;
  let freeEmailProvider: string | null = null;
  for (const domain of emailDomains) {
    if (inDomainList(domain, FREE_EMAIL_DOMAINS)) {
      freeEmailProvider ??= domain;
      continue;
    }
    corporateEmail = true;
    const label = registrableLabel(domain);
    if (labelMatchesCompany(label)) {
      corporateEmailMatchesCompany = true;
      if (label && labelInTokens(label, headlineTokens)) companyDomainInHeadline = true;
    }
  }

  const dmHits = findPhrases(flat, DM_PHRASES);
  const dmOnly = dmHits.length > 0 && externalLinks === 0 && emailDomains.size === 0;

  const companies = companyCandidates(text);
  const posterAtCompany =
    companyDomainInHeadline || companies.some((c) => headlineFlat.includes(flatten(c)));

  const comments = post.comments;
  const ageHours = post.ageHours;
  const commentsPerHour =
    comments !== null && ageHours !== null ? comments / Math.max(ageHours, 1) : null;

  return {
    hiringKeywordHits: findPhrases(flat, HIRING_KEYWORDS),
    jobContextHits: findPhrases(flat, JOB_CONTEXT_WORDS),
    seekerHits: findPhrases(flat, SEEKER_PHRASES),
    notHiringHits: findPhrases(flat, NOT_HIRING_PHRASES),
    atsNames: [...atsNames],
    careersPage,
    googleForm,
    opaqueLinks,
    shortenerLinks,
    whatsapp,
    telegram,
    corporateEmail,
    corporateEmailMatchesCompany,
    freeEmailProvider,
    dmOnly,
    baitHits: findPhrases(flat, BAIT_PHRASES),
    weakBaitHits: findPhrases(flat, WEAK_BAIT_WORDS),
    scamHits: findPhrases(flat, SCAM_PHRASES),
    payClaimHits: PAY_CLAIM_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.reason),
    posterAtCompany,
    specificity: specificity(text, flat),
    exposure: {
      ageHours,
      comments,
      reactions: post.reactions,
      reposts: post.reposts,
      commentsPerHour,
    },
    ageText: post.ageText,
  };
}
