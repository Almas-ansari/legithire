import * as C from '../config';
import type { Decision, Features, Label, ModelQuestion, ModelScores } from '../types';
import { reasonsFor } from './reasons';

export type Stage1Result = 'hiring' | 'not_hiring' | 'ask_model';

/** Model thresholds. Defaults come from config; scripts/eval.ts sweeps them on the dev split. */
export interface Thresholds {
  hiring: number;
  bait: number;
  scam: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  hiring: C.HIRING_MIN_SCORE,
  bait: C.BAIT_THRESHOLD,
  scam: C.SCAM_THRESHOLD,
};

/** Stage 1 by rules alone. */
export function stage1(f: Features): Stage1Result {
  if (f.seekerHits.length || f.notHiringHits.length) return 'not_hiring';
  // A scam phrase in a job context is a (fake) job offer even without a hiring
  // keyword. Deciding here also keeps scams from being hidden as "Not a Hiring Post".
  if (hasStrongScam(f) && (f.hiringKeywordHits.length || f.jobContextHits.length)) return 'hiring';
  if (!f.hiringKeywordHits.length) return 'not_hiring';
  // A trusted apply link settles it without the model.
  if (f.atsNames.length || f.careersPage) return 'hiring';
  return 'ask_model';
}

export function hasStrongScam(f: Features): boolean {
  return f.scamHits.length > 0 || f.payClaimHits.length > 0;
}

/** Messaging apps, shortened links and free email: each is only a weak signal. */
export function weakScamCount(f: Features): number {
  return [f.whatsapp || f.telegram, f.shortenerLinks > 0, !!f.freeEmailProvider && !f.corporateEmail].filter(
    Boolean,
  ).length;
}

export function hasGenuineChannel(f: Features): boolean {
  return (
    f.atsNames.length > 0 ||
    f.careersPage ||
    f.corporateEmail ||
    (f.googleForm && f.specificity.score >= C.FORM_MIN_SPECIFICITY) ||
    (f.opaqueLinks > 0 && f.specificity.score >= C.OPAQUE_LINK_MIN_SPECIFICITY)
  );
}

function isHiring(f: Features, scores: ModelScores, t: Thresholds): boolean {
  const s1 = stage1(f);
  if (s1 !== 'ask_model') return s1 === 'hiring';
  // Without a model answer (e.g. model not loaded yet), keywords decide.
  return scores.hiring === undefined || scores.hiring >= t.hiring;
}

/**
 * Model questions still worth asking, given what we already know. Ask them in
 * order: once "hiring" is answered, call again to get the Stage 3 questions.
 */
export function pendingQuestions(
  f: Features,
  scores: ModelScores,
  textLength = Infinity,
  t: Thresholds = DEFAULT_THRESHOLDS,
): ModelQuestion[] {
  if (textLength < C.MIN_TEXT_LENGTH_FOR_MODEL) return [];
  if (stage1(f) === 'ask_model' && scores.hiring === undefined) return ['hiring'];
  if (!isHiring(f, scores, t) || hasStrongScam(f)) return [];

  const out: ModelQuestion[] = [];
  const weak = weakScamCount(f);
  if (weak > 0 && weak < C.WEAK_SCAM_SIGNALS_FOR_SCAM && scores.scam === undefined) out.push('scam');

  const genuine = hasGenuineChannel(f);
  const baitHint = f.weakBaitHits.length > 0 || f.dmOnly;
  if (!genuine && !f.baitHits.length && baitHint && scores.bait === undefined) out.push('bait');
  return out;
}

function exposureLabel(f: Features): Label {
  const { ageHours, comments, commentsPerHour } = f.exposure;
  const c = comments ?? 0;
  if (ageHours !== null && ageHours <= C.APPLY_EARLY_MAX_AGE_HOURS && c < C.APPLY_EARLY_MAX_COMMENTS) {
    return 'apply_early';
  }
  if (
    c >= C.CROWDED_MIN_COMMENTS ||
    (ageHours !== null && ageHours > C.CROWDED_MIN_AGE_HOURS) ||
    (commentsPerHour !== null && commentsPerHour >= C.CROWDED_MIN_COMMENTS_PER_HOUR)
  ) {
    return 'crowded';
  }
  return 'real_opening';
}

/** Stage 4: first match wins. Missing model scores are treated as "not asked". */
export function decideLabel(f: Features, scores: ModelScores = {}, t: Thresholds = DEFAULT_THRESHOLDS): Label {
  if (!isHiring(f, scores, t)) return 'not_hiring';

  if (hasStrongScam(f) || weakScamCount(f) >= C.WEAK_SCAM_SIGNALS_FOR_SCAM || (scores.scam ?? 0) >= t.scam) {
    return 'scam_risk';
  }

  const genuine = hasGenuineChannel(f);
  if ((f.baitHits.length > 0 && !genuine) || (scores.bait ?? 0) >= t.bait) {
    return 'engagement_bait';
  }

  if (genuine) return exposureLabel(f);
  return 'unverified';
}

export function decide(f: Features, scores: ModelScores = {}, t: Thresholds = DEFAULT_THRESHOLDS): Decision {
  const label = decideLabel(f, scores, t);
  return { label, reasons: reasonsFor(label, f, scores, t) };
}
