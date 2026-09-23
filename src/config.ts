/**
 * Every tunable number and the model ID live here. Tune thresholds against
 * the dev split only (see scripts/eval.ts).
 */

/**
 * The model, bundled in models/<id>/ (npm run fetch-model). Any Transformers.js
 * NLI model works; nothing else in the code refers to a specific model.
 *
 * DeBERTa-v3-xsmall (~96 MB with tokenizer) replaced MobileBERT (~27 MB): on
 * the dev split MobileBERT's Stage 1 answers never beat rules alone (80.5%
 * accuracy at best), while DeBERTa reached 95.1%. Compare with
 * `npm run eval -- --sweep --model <id>`.
 */
export const MODEL_ID = 'Xenova/nli-deberta-v3-xsmall';
export const MODEL_DTYPE = 'q8';
export const HYPOTHESIS_TEMPLATE = 'This LinkedIn post {}.';

/**
 * Stage 1 labels. The spec's 3-way wording ("offers a job opening at a
 * company" / "shares a personal achievement..." / "is a person looking for a
 * job") separated hiring from non-hiring posts poorly (dev AUC 0.75 with
 * MobileBERT). This pair scored 0.91 on the same posts. Job seekers and
 * "I got hired" posts are caught by rules before the model is asked.
 */
export const HIRING_LABELS = [
  'announces open jobs that people can apply for',
  'shares a story, advice, opinion or news',
] as const;

export const BAIT_LABELS = [
  'requires readers to comment or follow in order to be considered for a job',
  'gives a direct way to apply for a job',
] as const;

export const SCAM_LABELS = [
  'asks candidates to pay money or share sensitive personal documents',
  'describes a normal job application process',
] as const;

/**
 * Stage 1: minimum probability for the first HIRING_LABELS entry. Chosen on
 * the dev split (npm run eval -- --sweep): 0.30-0.40 all scored best; 0.35 is
 * the middle of that plateau.
 */
export const HIRING_MIN_SCORE = 0.35;
/**
 * Stage 3 thresholds on the first (positive) label's probability. Too few dev
 * posts reach these questions to tune them, so they are set high: the model
 * only overrides the rules when it is very sure.
 */
export const BAIT_THRESHOLD = 0.95;
export const SCAM_THRESHOLD = 0.95;

/**
 * Weak scam signals (WhatsApp/Telegram, shortened link, free email only)
 * needed to call Scam Risk without the model. Fewer than this, but at least
 * one, sends the post to the scam model. Many small real employers use Gmail
 * plus WhatsApp, so two is not enough on its own.
 */
export const WEAK_SCAM_SIGNALS_FOR_SCAM = 3;

/** Specificity (0-5) needed for a Google Form to count as a genuine channel. */
export const FORM_MIN_SPECIFICITY = 2;
/** Specificity needed for an lnkd.in link (hidden destination) to count. */
export const OPAQUE_LINK_MIN_SPECIFICITY = 3;

export const APPLY_EARLY_MAX_AGE_HOURS = 24;
export const APPLY_EARLY_MAX_COMMENTS = 50;
export const CROWDED_MIN_COMMENTS = 200;
export const CROWDED_MIN_AGE_HOURS = 7 * 24;
export const CROWDED_MIN_COMMENTS_PER_HOUR = 20;

/** Maximum signals shown in a reason line. */
export const MAX_REASONS = 4;
/** Posts shorter than this are not worth a model call. */
export const MIN_TEXT_LENGTH_FOR_MODEL = 40;
