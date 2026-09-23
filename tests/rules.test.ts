import { describe, expect, it } from 'vitest';
import {
  ATS_DOMAINS,
  FREE_EMAIL_DOMAINS,
  SHORTENER_DOMAINS,
  TELEGRAM_DOMAINS,
  WHATSAPP_DOMAINS,
  findDomain,
  inDomainList,
  registrableLabel,
} from '../src/rules/domains';
import * as P from '../src/rules/phrases';
import { findPhrases, flatten, labelInTokens, tokens } from '../src/rules/text';

describe('flatten / findPhrases', () => {
  it('ignores case, quotes, punctuation and hashtags', () => {
    const flat = flatten('Comment “INTERESTED”!! #Hiring');
    expect(findPhrases(flat, ['comment interested', 'hiring'])).toEqual(['comment interested', 'hiring']);
  });

  it('matches whole words only', () => {
    expect(findPhrases(flatten('We are rehiring soon'), ['hiring'])).toEqual([]);
    expect(findPhrases(flatten('eye-opening talk'), ['opening'])).toEqual(['opening']);
  });

  it("lets contributors write apostrophes naturally", () => {
    expect(findPhrases(flatten("We’re hiring!"), ["we're hiring"])).toEqual(["we're hiring"]);
  });

  it('joins adjacent tokens for company labels', () => {
    const toks = tokens(flatten('Join Acme Corp today'));
    expect(labelInTokens('acmecorp', toks)).toBe(true);
    expect(labelInTokens('acme', toks)).toBe(true);
    expect(labelInTokens('corp', toks)).toBe(true);
    expect(labelInTokens('ac', toks)).toBe(false);
    expect(labelInTokens('globex', toks)).toBe(false);
  });
});

/** Every phrase in every list must match itself in a sentence. Catches typos in contributions. */
describe.each([
  ['HIRING_KEYWORDS', P.HIRING_KEYWORDS],
  ['SEEKER_PHRASES', P.SEEKER_PHRASES],
  ['NOT_HIRING_PHRASES', P.NOT_HIRING_PHRASES],
  ['BAIT_PHRASES', P.BAIT_PHRASES],
  ['WEAK_BAIT_WORDS', P.WEAK_BAIT_WORDS],
  ['DM_PHRASES', P.DM_PHRASES],
  ['SCAM_PHRASES', P.SCAM_PHRASES],
  ['TECH_TERMS', P.TECH_TERMS],
  ['ROLE_TERMS', P.ROLE_TERMS],
  ['LOCATION_TERMS', P.LOCATION_TERMS],
])('%s', (_name, list) => {
  it('has no duplicates', () => {
    expect(new Set(list).size).toBe(list.length);
  });
  it.each(list.map((p) => [p]))('"%s" matches in a sentence', (phrase) => {
    const flat = flatten(`Hello. ${phrase.toUpperCase()}! Thanks.`);
    expect(findPhrases(flat, [phrase])).toEqual([phrase]);
  });
});

describe('specific phrase behaviour', () => {
  const hits = (text: string, list: readonly string[]) => findPhrases(flatten(text), list);

  it('bait', () => {
    expect(hits('Comment "Interested" and I will DM you', P.BAIT_PHRASES)).toContain('comment interested');
    expect(hits("Comment 'yes' below", P.BAIT_PHRASES)).toContain('comment yes');
    expect(hits('Like & repost for better reach', P.BAIT_PHRASES)).toContain('repost for better reach');
    expect(hits('Tag 3 friends who need this', P.BAIT_PHRASES)).toContain('tag 3 friends');
  });

  it('scam', () => {
    expect(hits('A refundable fee of Rs 999 applies', P.SCAM_PHRASES)).toContain('refundable fee');
    expect(hits('Send your Aadhaar and PAN card', P.SCAM_PHRASES)).toEqual(['aadhaar', 'pan card']);
    expect(hits('Part-time typing job, no interview', P.SCAM_PHRASES)).toEqual(
      expect.arrayContaining(['part time typing job', 'typing job', 'no interview']),
    );
    expect(hits('Task-based earning opportunity', P.SCAM_PHRASES)).toContain('task based earning');
  });

  it('seekers', () => {
    expect(hits('#OpenToWork Frontend dev', P.SEEKER_PHRASES)).toContain('opentowork');
    expect(hits("I'm looking for a job in data science", P.SEEKER_PHRASES)).toContain('i m looking for a job');
  });

  it('dm phrases', () => {
    expect(hits('Interested folks, DM me.', P.DM_PHRASES)).toContain('dm me');
  });
});

describe('pay claim patterns', () => {
  const claims = (t: string) => P.PAY_CLAIM_PATTERNS.filter((p) => p.pattern.test(t)).map((p) => p.reason);
  it.each([
    'Earn ₹2000 per day from home',
    'earn up to Rs. 5,000/day',
    'Earn $50 per hour typing',
    'Get ₹1500/day guaranteed',
    'Daily payout!',
  ])('flags "%s"', (t) => expect(claims(t).length).toBeGreaterThan(0));

  it.each(['CTC 12-18 LPA', 'Salary: $120k - $150k per year', '5+ years of experience', 'All users 100% remote'])(
    'does not flag "%s"',
    (t) => expect(claims(t)).toEqual([]),
  );
});

describe('specificity patterns', () => {
  const salary = (t: string) => P.SALARY_PATTERNS.some((re) => re.test(t));
  const exp = (t: string) => P.EXPERIENCE_PATTERNS.some((re) => re.test(t));
  it('salary', () => {
    expect(salary('CTC: 10-14 LPA')).toBe(true);
    expect(salary('$120k base')).toBe(true);
    expect(salary('₹8L fixed')).toBe(true);
    expect(salary('all users 100 happy')).toBe(false);
  });
  it('experience', () => {
    expect(exp('3-5 years')).toBe(true);
    expect(exp('5+ yrs')).toBe(true);
    expect(exp('Freshers welcome')).toBe(true);
    expect(exp('Experience: 2 to 4')).toBe(true);
    expect(exp('A great team')).toBe(false);
  });
});

describe('domains', () => {
  const ats = (u: string) => findDomain(new URL(u), ATS_DOMAINS)?.name;

  it.each([
    ['https://boards.greenhouse.io/acme/jobs/123', 'Greenhouse'],
    ['https://job-boards.greenhouse.io/acme/jobs/123', 'Greenhouse'],
    ['https://jobs.lever.co/acme/abc', 'Lever'],
    ['https://acme.wd5.myworkdayjobs.com/en-US/careers/job/x', 'Workday'],
    ['https://jobs.ashbyhq.com/acme', 'Ashby'],
    ['https://www.linkedin.com/jobs/view/12345', 'LinkedIn Jobs'],
    ['https://www.naukri.com/job-listings-x', 'Naukri'],
    ['https://acme.keka.com/careers', 'Keka'],
    ['https://acme.darwinbox.in/ms/candidate/careers', 'Darwinbox'],
  ])('%s -> %s', (u, name) => expect(ats(u)).toBe(name));

  it('does not treat other LinkedIn pages as job links', () => {
    expect(ats('https://www.linkedin.com/in/someone')).toBeUndefined();
    expect(ats('https://www.linkedin.com/feed/hashtag/hiring')).toBeUndefined();
  });

  it('does not match look-alike hosts', () => {
    expect(ats('https://notgreenhouse.io/x')).toBeUndefined();
    expect(ats('https://greenhouse.io.evil.com/x')).toBeUndefined();
  });

  it('every list entry is a lowercase bare host', () => {
    const all = [
      ...ATS_DOMAINS.map((d) => d.domain),
      ...FREE_EMAIL_DOMAINS,
      ...SHORTENER_DOMAINS,
      ...WHATSAPP_DOMAINS,
      ...TELEGRAM_DOMAINS,
    ];
    for (const d of all) expect(d).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
  });

  it('classifies messaging, shorteners and free email', () => {
    expect(inDomainList('wa.me', WHATSAPP_DOMAINS)).toBe(true);
    expect(inDomainList('chat.whatsapp.com', WHATSAPP_DOMAINS)).toBe(true);
    expect(inDomainList('t.me', TELEGRAM_DOMAINS)).toBe(true);
    expect(inDomainList('bit.ly', SHORTENER_DOMAINS)).toBe(true);
    expect(inDomainList('gmail.com', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(inDomainList('acme.com', FREE_EMAIL_DOMAINS)).toBe(false);
  });

  it.each([
    ['acme.com', 'acme'],
    ['www.acme.com', 'acme'],
    ['careers.acme.com', 'acme'],
    ['careers.acme.co.in', 'acme'],
    ['acme.co.uk', 'acme'],
    ['com', null],
  ])('registrableLabel(%s) = %s', (host, label) => expect(registrableLabel(host)).toBe(label));
});
