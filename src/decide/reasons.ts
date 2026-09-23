/**
 * Reason lines are built only from these templates. No model ever writes text.
 */
import * as C from '../config';
import { formatAge } from '../rules/age';
import type { Features, Label, ModelScores } from '../types';
import type { Thresholds } from './decide';

export const LABEL_TEXT: Record<Label, string> = {
  apply_early: 'Apply Early',
  real_opening: 'Real Opening',
  crowded: 'Crowded',
  engagement_bait: 'Engagement Bait',
  scam_risk: 'Scam Risk',
  unverified: 'Unverified',
  not_hiring: 'Not a Hiring Post',
};

const PHRASE_DISPLAY: Record<string, string> = {
  aadhaar: 'Aadhaar',
  aadhar: 'Aadhaar',
  'pan card': 'PAN card',
};

/** Scam phrases that read badly after "Mentions". */
const SCAM_REASON: Record<string, string> = {
  'no interview': 'Says no interview needed',
  'without interview': 'Says no interview needed',
  'guaranteed job': 'Promises a guaranteed job',
  'job guarantee': 'Promises a guaranteed job',
  '100 job guarantee': 'Promises a guaranteed job',
  'pay to join': 'Asks you to pay to join',
};

function display(phrase: string): string {
  return PHRASE_DISPLAY[phrase] ?? phrase;
}

function scamReason(hit: string): string {
  return SCAM_REASON[hit] ?? `Mentions ${display(hit)}`;
}

function ageReason(f: Features): string | null {
  const h = f.exposure.ageHours;
  if (h === null) return null;
  const age = formatAge(h);
  return age === 'just now' ? 'posted just now' : `posted ${age} ago`;
}

function commentsReason(f: Features): string | null {
  const c = f.exposure.comments;
  if (c === null) return null;
  return `${c.toLocaleString('en-US')} comment${c === 1 ? '' : 's'}`;
}

function channelReasons(f: Features): string[] {
  const out: string[] = [];
  if (f.atsNames.length) out.push(`Apply link on ${f.atsNames[0]}`);
  else if (f.careersPage) out.push('Links to company careers page');
  else if (f.corporateEmail) out.push(f.corporateEmailMatchesCompany ? 'Company email address' : 'Work email address');
  else if (f.googleForm) out.push('Google Form with role details');
  else if (f.opaqueLinks) out.push('Apply link with role details');
  return out;
}

function scamReasons(f: Features, scores: ModelScores, t: Thresholds): string[] {
  const out: string[] = [];
  for (const reason of new Set(f.scamHits.map(scamReason))) if (out.length < 2) out.push(reason);
  out.push(...f.payClaimHits.slice(0, 1));
  if (f.whatsapp) out.push('WhatsApp contact');
  if (f.telegram) out.push('Telegram contact');
  if (f.shortenerLinks) out.push('Shortened link');
  if (f.freeEmailProvider && !f.corporateEmail) out.push(`${f.freeEmailProvider} address`);
  if ((scores.scam ?? 0) >= t.scam) out.push('Reads like a pay-to-join offer');
  return out;
}

function baitReasons(f: Features, scores: ModelScores, t: Thresholds): string[] {
  const out: string[] = [];
  for (const hit of f.baitHits.slice(0, 2)) out.push(`Asks you to "${hit}"`);
  if (!f.baitHits.length && (scores.bait ?? 0) >= t.bait) out.push('Reads like engagement bait');
  if (f.dmOnly) out.push('Only "DM me"');
  else if (!channelReasons(f).length) out.push('no apply link');
  return out;
}

function notHiringReasons(f: Features): string[] {
  if (f.seekerHits.includes('opentowork')) return ['Job seeker post (#OpenToWork)'];
  if (f.seekerHits.length) return ['Job seeker post'];
  if (f.notHiringHits.length) return ['Personal career update'];
  if (!f.hiringKeywordHits.length) return ['No hiring keywords'];
  return ['Reads like a story, advice or update'];
}

function unverifiedReasons(f: Features): string[] {
  const out: string[] = [];
  if (f.dmOnly) out.push('Only "DM me"');
  else if (f.googleForm) out.push('Google Form, few role details');
  else if (f.opaqueLinks) out.push('Link destination hidden, few role details');
  else if (f.freeEmailProvider) out.push(`${f.freeEmailProvider} address only`);
  else out.push('No apply link or company email');
  if (f.whatsapp) out.push('WhatsApp contact');
  if (f.telegram) out.push('Telegram contact');
  return out;
}

export function reasonsFor(
  label: Label,
  f: Features,
  scores: ModelScores = {},
  t: Thresholds = { hiring: C.HIRING_MIN_SCORE, bait: C.BAIT_THRESHOLD, scam: C.SCAM_THRESHOLD },
): string[] {
  let parts: (string | null)[];
  switch (label) {
    case 'not_hiring':
      parts = notHiringReasons(f);
      break;
    case 'scam_risk':
      parts = scamReasons(f, scores, t);
      break;
    case 'engagement_bait':
      parts = [...baitReasons(f, scores, t), commentsReason(f)];
      break;
    case 'unverified':
      parts = [...unverifiedReasons(f), ageReason(f)];
      break;
    case 'crowded': {
      const fast = (f.exposure.commentsPerHour ?? 0) >= C.CROWDED_MIN_COMMENTS_PER_HOUR;
      parts = [...channelReasons(f), ageReason(f), commentsReason(f), fast ? 'comments piling up fast' : null];
      break;
    }
    default:
      parts = [
        ...channelReasons(f),
        ageReason(f),
        commentsReason(f),
        f.posterAtCompany ? 'poster works there' : null,
      ];
  }
  return parts.filter((p): p is string => !!p).slice(0, C.MAX_REASONS);
}

/** "Apply link on Greenhouse · posted 5h ago · 12 comments" */
export function reasonLine(reasons: string[]): string {
  return reasons.join(' · ');
}
