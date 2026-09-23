import { describe, expect, it } from 'vitest';
import { companyCandidates, extractFeatures } from '../src/rules/features';
import { link, post } from './helpers';

describe('apply channel', () => {
  it('detects ATS links from href', () => {
    const f = extractFeatures(post('We are hiring! Apply here', { links: [link('https://jobs.lever.co/acme/1', 'Apply')] }));
    expect(f.atsNames).toEqual(['Lever']);
  });

  it('detects ATS links written in the text', () => {
    const f = extractFeatures(post('Apply: https://boards.greenhouse.io/acme/jobs/1'));
    expect(f.atsNames).toEqual(['Greenhouse']);
  });

  it('unwraps LinkedIn redirect links', () => {
    const wrapped = 'https://www.linkedin.com/redir/redirect?url=' + encodeURIComponent('https://jobs.ashbyhq.com/acme');
    const f = extractFeatures(post('Apply', { links: [link(wrapped, 'Apply')] }));
    expect(f.atsNames).toEqual(['Ashby']);
  });

  it('uses URL display text when the href is a wrapper', () => {
    const f = extractFeatures(post('Apply', { links: [link('https://lnkd.in/abc', 'careers.acme.com/jobs/1')] }));
    expect(f.opaqueLinks).toBe(1);
  });

  it('counts lnkd.in once even when text and href repeat it', () => {
    const f = extractFeatures(post('Apply https://lnkd.in/abc', { links: [link('https://lnkd.in/abc', 'lnkd.in/abc')] }));
    expect(f.opaqueLinks).toBe(1);
  });

  it('detects a careers page that matches the company named in the text', () => {
    const f = extractFeatures(post('Acme is hiring a backend engineer', { links: [link('https://careers.acme.com/role/1')] }));
    expect(f.careersPage).toBe(true);
  });

  it('matches the careers domain against the headline too', () => {
    const f = extractFeatures(
      post('We are hiring!', { authorHeadline: 'Engineering Manager at Acme', links: [link('https://acme.com/careers/1')] }),
    );
    expect(f.careersPage).toBe(true);
    expect(f.posterAtCompany).toBe(true);
  });

  it('ignores careers-looking links for an unrelated company', () => {
    const f = extractFeatures(post('We are hiring!', { links: [link('https://careers.globex.com/1')] }));
    expect(f.careersPage).toBe(false);
  });

  it('flags Google Forms, WhatsApp, Telegram and shorteners', () => {
    const f = extractFeatures(
      post('Apply', {
        links: [
          link('https://forms.gle/abc'),
          link('https://wa.me/919999999999'),
          link('https://t.me/somechannel'),
          link('https://bit.ly/xyz'),
        ],
      }),
    );
    expect(f.googleForm).toBe(true);
    expect(f.whatsapp).toBe(true);
    expect(f.telegram).toBe(true);
    expect(f.shortenerLinks).toBe(1);
  });

  it('flags WhatsApp mentioned in text', () => {
    expect(extractFeatures(post('WhatsApp your CV to 98xxxxxx')).whatsapp).toBe(true);
  });

  it('classifies email domains without keeping addresses', () => {
    const f = extractFeatures(post('Acme is hiring. Send CV to jobs@acme.com or hr.acme@gmail.com'));
    expect(f.corporateEmail).toBe(true);
    expect(f.corporateEmailMatchesCompany).toBe(true);
    expect(f.freeEmailProvider).toBe('gmail.com');
    expect(JSON.stringify(f)).not.toContain('jobs@');
    expect(JSON.stringify(f)).not.toContain('hr.acme');
  });

  it('does not let an email address match its own company', () => {
    const f = extractFeatures(post('We are hiring. Send CV to jobs@globex.com'));
    expect(f.corporateEmail).toBe(true);
    expect(f.corporateEmailMatchesCompany).toBe(false);
  });

  it('dmOnly is set only when there is no other channel', () => {
    expect(extractFeatures(post('Hiring React devs, DM me')).dmOnly).toBe(true);
    expect(
      extractFeatures(post('Hiring React devs, DM me', { links: [link('https://jobs.lever.co/x/1')] })).dmOnly,
    ).toBe(false);
  });

  it('ignores LinkedIn profile and hashtag links', () => {
    const f = extractFeatures(
      post('Hiring, DM me', {
        links: [link('https://www.linkedin.com/in/someone'), link('https://www.linkedin.com/feed/hashtag/hiring')],
      }),
    );
    expect(f.dmOnly).toBe(true);
  });
});

describe('specificity', () => {
  it('scores concrete details', () => {
    const f = extractFeatures(
      post('Hiring a Senior Backend Engineer (Python, AWS). 4-6 years. Bengaluru, hybrid. CTC 30-40 LPA.'),
    );
    expect(f.specificity).toMatchObject({ roleTitle: true, experience: true, techStack: true, location: true, salary: true, score: 5 });
  });

  it('is zero for vague posts', () => {
    expect(extractFeatures(post('We are hiring! Great opportunity!')).specificity.score).toBe(0);
  });
});

describe('exposure', () => {
  it('computes comments per hour', () => {
    const f = extractFeatures(post('x', { ageHours: 4, comments: 100 }));
    expect(f.exposure.commentsPerHour).toBe(25);
  });
  it('treats very new posts as one hour old', () => {
    expect(extractFeatures(post('x', { ageHours: 0, comments: 5 })).exposure.commentsPerHour).toBe(5);
  });
  it('is null when unknown', () => {
    expect(extractFeatures(post('x', { ageHours: null })).exposure.commentsPerHour).toBeNull();
  });
});

describe('companyCandidates / posterAtCompany', () => {
  it('finds names after "at", "join" and before "is hiring"', () => {
    expect(companyCandidates('We at Acme Labs are growing')).toContain('Acme Labs');
    expect(companyCandidates('Globex is hiring!')).toContain('Globex');
    expect(companyCandidates('Join Initech as an SDE')).toContain('Initech');
  });

  it('matches the headline', () => {
    const f = extractFeatures(post('Globex is hiring engineers', { authorHeadline: 'Talent Partner @ Globex | ex-Initech' }));
    expect(f.posterAtCompany).toBe(true);
  });

  it('is false when the headline names another company', () => {
    const f = extractFeatures(post('Globex is hiring engineers', { authorHeadline: 'Recruiter at Initech' }));
    expect(f.posterAtCompany).toBe(false);
  });
});

describe('privacy', () => {
  it('features never contain the post text, headline or links', () => {
    const f = extractFeatures(
      post('Secret Project Zeta is hiring, email priya.sharma@zeta.io', {
        authorHeadline: 'Priya Sharma, CTO at Zeta',
        links: [link('https://www.linkedin.com/in/priya-sharma-123')],
      }),
    );
    const json = JSON.stringify(f).toLowerCase();
    for (const s of ['priya', 'sharma', 'secret project', 'zeta', 'linkedin.com/in']) expect(json).not.toContain(s);
  });
});
