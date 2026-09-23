import { describe, expect, it } from 'vitest';
import * as C from '../src/config';
import { decide, decideLabel, hasGenuineChannel, pendingQuestions, stage1 } from '../src/decide/decide';
import { reasonLine } from '../src/decide/reasons';
import { classify, classifyRules } from '../src/pipeline';
import type { Features } from '../src/types';
import { link, post } from './helpers';

function features(o: Partial<Features> = {}): Features {
  return {
    hiringKeywordHits: ['hiring'],
    jobContextHits: [],
    seekerHits: [],
    notHiringHits: [],
    atsNames: [],
    careersPage: false,
    googleForm: false,
    opaqueLinks: 0,
    shortenerLinks: 0,
    whatsapp: false,
    telegram: false,
    corporateEmail: false,
    corporateEmailMatchesCompany: false,
    freeEmailProvider: null,
    dmOnly: false,
    baitHits: [],
    weakBaitHits: [],
    scamHits: [],
    payClaimHits: [],
    posterAtCompany: false,
    specificity: { roleTitle: false, experience: false, techStack: false, location: false, salary: false, score: 0 },
    exposure: { ageHours: 5, comments: 12, reactions: 10, reposts: 0, commentsPerHour: 2.4 },
    ageText: '5h',
    ...o,
  };
}

const spec = (score: number) => ({
  roleTitle: score > 0, experience: score > 1, techStack: score > 2, location: score > 3, salary: score > 4, score,
});
const exposure = (ageHours: number | null, comments: number | null) => ({
  ageHours,
  comments,
  reactions: 0,
  reposts: 0,
  commentsPerHour: ageHours !== null && comments !== null ? comments / Math.max(ageHours, 1) : null,
});

describe('stage1', () => {
  it('no hiring keywords -> not hiring', () => expect(stage1(features({ hiringKeywordHits: [] }))).toBe('not_hiring'));
  it('seeker -> not hiring', () => expect(stage1(features({ seekerHits: ['opentowork'] }))).toBe('not_hiring'));
  it('"I got hired" -> not hiring', () => expect(stage1(features({ notHiringHits: ['i got hired'] }))).toBe('not_hiring'));
  it('keywords only -> ask model', () => expect(stage1(features())).toBe('ask_model'));
  it('ATS link settles it', () => expect(stage1(features({ atsNames: ['Lever'] }))).toBe('hiring'));
  it('scam phrase settles it so scams are never hidden', () =>
    expect(stage1(features({ scamHits: ['registration fee'] }))).toBe('hiring'));
  it('scam phrase in a job context counts even without hiring keywords', () => {
    expect(stage1(features({ hiringKeywordHits: [], jobContextHits: ['earn'], scamHits: ['task based earning'] }))).toBe('hiring');
    expect(stage1(features({ hiringKeywordHits: [], scamHits: ['aadhaar'] }))).toBe('not_hiring');
  });
});

describe('decision table, in order', () => {
  it('1. not hiring wins over everything', () => {
    expect(decideLabel(features({ hiringKeywordHits: [], scamHits: ['aadhaar'] }))).toBe('not_hiring');
  });

  it('1. model says not hiring', () => {
    expect(decideLabel(features({ corporateEmail: true }), { hiring: 0.1 })).toBe('not_hiring');
    expect(decideLabel(features({ corporateEmail: true }), { hiring: C.HIRING_MIN_SCORE })).not.toBe('not_hiring');
  });

  it('2. any strong scam signal beats a genuine channel', () => {
    expect(decideLabel(features({ atsNames: ['Lever'], scamHits: ['registration fee'] }))).toBe('scam_risk');
    expect(decideLabel(features({ payClaimHits: ['Promises pay per day'] }))).toBe('scam_risk');
  });

  it('2. enough weak scam signals', () => {
    const weak = { whatsapp: true, shortenerLinks: 1, freeEmailProvider: 'gmail.com' };
    expect(decideLabel(features(weak))).toBe('scam_risk');
    expect(decideLabel(features({ whatsapp: true, freeEmailProvider: 'gmail.com' }))).toBe('unverified');
  });

  it('2. scam model score above threshold', () => {
    expect(decideLabel(features({ whatsapp: true }), { scam: C.SCAM_THRESHOLD })).toBe('scam_risk');
    expect(decideLabel(features({ whatsapp: true }), { scam: C.SCAM_THRESHOLD - 0.01 })).toBe('unverified');
  });

  it('3. bait phrase with no genuine channel', () => {
    expect(decideLabel(features({ baitHits: ['comment interested'] }))).toBe('engagement_bait');
  });

  it('3. bait phrase with a genuine channel is not bait', () => {
    expect(decideLabel(features({ baitHits: ['follow me'], atsNames: ['Lever'] }))).toBe('apply_early');
  });

  it('3. bait model score above threshold', () => {
    expect(decideLabel(features({ weakBaitHits: ['comment'] }), { bait: C.BAIT_THRESHOLD })).toBe('engagement_bait');
  });

  it('4. genuine channels', () => {
    expect(hasGenuineChannel(features({ atsNames: ['Lever'] }))).toBe(true);
    expect(hasGenuineChannel(features({ careersPage: true }))).toBe(true);
    expect(hasGenuineChannel(features({ corporateEmail: true }))).toBe(true);
    expect(hasGenuineChannel(features({ googleForm: true, specificity: spec(C.FORM_MIN_SPECIFICITY) }))).toBe(true);
    expect(hasGenuineChannel(features({ googleForm: true, specificity: spec(C.FORM_MIN_SPECIFICITY - 1) }))).toBe(false);
    expect(hasGenuineChannel(features({ opaqueLinks: 1, specificity: spec(C.OPAQUE_LINK_MIN_SPECIFICITY) }))).toBe(true);
    expect(hasGenuineChannel(features({ opaqueLinks: 1, specificity: spec(C.OPAQUE_LINK_MIN_SPECIFICITY - 1) }))).toBe(false);
    expect(hasGenuineChannel(features({ freeEmailProvider: 'gmail.com' }))).toBe(false);
    expect(hasGenuineChannel(features({ dmOnly: true }))).toBe(false);
  });

  describe('4. exposure', () => {
    const at = (age: number | null, comments: number | null) =>
      decideLabel(features({ atsNames: ['Lever'], exposure: exposure(age, comments) }));

    it('apply early: <= 24h and < 50 comments', () => {
      expect(at(5, 12)).toBe('apply_early');
      expect(at(24, 49)).toBe('apply_early');
      expect(at(1, null)).toBe('apply_early');
    });
    it('crowded: >= 200 comments', () => expect(at(30, 200)).toBe('crowded'));
    it('crowded: older than 7 days', () => expect(at(7 * 24 + 1, 5)).toBe('crowded'));
    it('crowded: comments per hour very high', () => expect(at(25, 25 * C.CROWDED_MIN_COMMENTS_PER_HOUR)).toBe('crowded'));
    it('real opening otherwise', () => {
      expect(at(24, 50)).toBe('real_opening');
      expect(at(48, 60)).toBe('real_opening');
      expect(at(7 * 24, 5)).toBe('real_opening');
      expect(at(null, 10)).toBe('real_opening');
    });
    it('apply early is checked before crowded', () => expect(at(2, 49)).toBe('apply_early'));
  });

  it('5. everything else is unverified', () => {
    expect(decideLabel(features())).toBe('unverified');
    expect(decideLabel(features({ dmOnly: true }))).toBe('unverified');
  });
});

describe('pendingQuestions', () => {
  it('asks hiring first', () => expect(pendingQuestions(features(), {})).toEqual(['hiring']));
  it('asks nothing for rule-decided posts', () => {
    expect(pendingQuestions(features({ hiringKeywordHits: [] }), {})).toEqual([]);
    expect(pendingQuestions(features({ atsNames: ['Lever'] }), {})).toEqual([]);
    expect(pendingQuestions(features({ scamHits: ['aadhaar'] }), {})).toEqual([]);
  });
  it('stops if the model says not hiring', () =>
    expect(pendingQuestions(features({ whatsapp: true }), { hiring: 0.1 })).toEqual([]));
  it('asks scam for a single weak scam signal', () =>
    expect(pendingQuestions(features({ whatsapp: true }), { hiring: 0.9 })).toEqual(['scam']));
  it('asks bait for bait hints without a channel', () => {
    expect(pendingQuestions(features({ weakBaitHits: ['comment'] }), { hiring: 0.9 })).toEqual(['bait']);
    expect(pendingQuestions(features({ dmOnly: true }), { hiring: 0.9 })).toEqual(['bait']);
  });
  it('does not ask bait when a rule already decided it', () => {
    expect(pendingQuestions(features({ weakBaitHits: ['comment'], baitHits: ['comment interested'] }), { hiring: 0.9 })).toEqual([]);
    expect(pendingQuestions(features({ weakBaitHits: ['comment'], atsNames: ['Lever'] }), {})).toEqual([]);
  });
  it('skips very short posts', () => expect(pendingQuestions(features(), {}, 10)).toEqual([]));
});

describe('reasons', () => {
  it('genuine post', () => {
    const d = decide(features({ atsNames: ['Greenhouse'] }));
    expect(reasonLine(d.reasons)).toBe('Apply link on Greenhouse · posted 5h ago · 12 comments');
  });
  it('bait post', () => {
    const d = decide(features({ baitHits: ['comment interested'] }));
    expect(reasonLine(d.reasons)).toBe('Asks you to "comment interested" · no apply link · 12 comments');
  });
  it('scam post', () => {
    const d = decide(features({ scamHits: ['registration fee'], whatsapp: true }));
    expect(reasonLine(d.reasons)).toBe('Mentions registration fee · WhatsApp contact');
  });
  it('never more than MAX_REASONS', () => {
    const d = decide(features({ scamHits: ['aadhaar', 'pan card', 'bank details'], payClaimHits: ['x'], whatsapp: true, telegram: true }));
    expect(d.reasons.length).toBeLessThanOrEqual(C.MAX_REASONS);
    expect(d.reasons[0]).toBe('Mentions Aadhaar');
  });
  it('every label has at least one reason', () => {
    const cases: Partial<Features>[] = [
      { hiringKeywordHits: [] },
      { scamHits: ['aadhaar'] },
      { baitHits: ['follow me'] },
      { atsNames: ['Lever'] },
      { atsNames: ['Lever'], exposure: exposure(48, 60) },
      { atsNames: ['Lever'], exposure: exposure(400, 300) },
      {},
    ];
    const labels = new Set<string>();
    for (const c of cases) {
      const d = decide(features(c));
      labels.add(d.label);
      expect(d.reasons.length).toBeGreaterThan(0);
    }
    expect(labels.size).toBe(7);
  });
});

describe('end-to-end on text (rules only)', () => {
  const label = (...a: Parameters<typeof post>) => classifyRules(post(...a)).decision.label;

  it('genuine ATS post', () => {
    expect(label('We are hiring a Backend Engineer!', { links: [link('https://jobs.lever.co/acme/1')] })).toBe('apply_early');
  });
  it('bait post', () => {
    expect(label('Hiring freshers! Comment "interested" and follow me to get the referral link.')).toBe('engagement_bait');
  });
  it('scam post', () => {
    expect(label('Hiring for data entry. Earn ₹3000 per day. Small registration fee. WhatsApp 98xxxxxx')).toBe('scam_risk');
  });
  it('job seeker', () => expect(label('#OpenToWork I am looking for a job as a React developer')).toBe('not_hiring'));
  it('achievement story', () => expect(label('Happy to share that I have started a new position at Acme!')).toBe('not_hiring'));
  it('advice with no keywords', () => expect(label('5 tips to ace your system design interview')).toBe('not_hiring'));
  it('vague hiring post', () => expect(label('We are hiring! Great opportunity for everyone.')).toBe('unverified'));
});

describe('classify with a model', () => {
  const fake = (scores: Record<string, number>) => {
    const asked: string[] = [];
    return {
      asked,
      score: async (q: string) => {
        asked.push(q);
        return scores[q] ?? 0;
      },
    };
  };

  it('never calls the model for rule-decided posts', async () => {
    const m = fake({});
    await classify(post('5 tips for interviews'), m);
    await classify(post('Hiring! Apply at https://jobs.lever.co/acme/1'), m);
    expect(m.asked).toEqual([]);
  });

  it('asks hiring, then Stage 3 questions', async () => {
    const m = fake({ hiring: 0.9, bait: 0.99 });
    const r = await classify(post('We are hiring React developers, drop a comment and I will reach out to you soon'), m);
    expect(m.asked).toEqual(['hiring', 'bait']);
    expect(r.decision.label).toBe('engagement_bait');
  });

  it('stops after hiring = no', async () => {
    const m = fake({ hiring: 0.05 });
    const r = await classify(post('I joined a hiring panel last week and here is what I learned about candidates'), m);
    expect(m.asked).toEqual(['hiring']);
    expect(r.decision.label).toBe('not_hiring');
  });
});
