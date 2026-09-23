/**
 * Zero-shot scoring shared by the offscreen document (browser) and
 * scripts/eval.ts (Node). Each question is one pipeline call with 2-3 labels;
 * the score is the probability of the first ("positive") label.
 */
import * as C from '../config';
import type { ModelQuestion, ModelScores } from '../types';

export interface ZeroShotOutput {
  labels: string[];
  scores: number[];
}

export type ZeroShotPipeline = (
  text: string,
  labels: string[],
  options: { hypothesis_template: string; multi_label: boolean },
) => Promise<ZeroShotOutput | ZeroShotOutput[]>;

export const QUESTION_LABELS: Record<ModelQuestion, readonly string[]> = {
  hiring: C.HIRING_LABELS,
  bait: C.BAIT_LABELS,
  scam: C.SCAM_LABELS,
};

/** MobileBERT reads at most 512 tokens; the start of a post carries the signal. */
export const MAX_MODEL_CHARS = 1200;

export async function scoreQuestion(zs: ZeroShotPipeline, question: ModelQuestion, text: string): Promise<number> {
  const labels = [...QUESTION_LABELS[question]];
  const raw = await zs(text.slice(0, MAX_MODEL_CHARS), labels, {
    hypothesis_template: C.HYPOTHESIS_TEMPLATE,
    multi_label: false,
  });
  const out = Array.isArray(raw) ? raw[0]! : raw;
  const i = out.labels.indexOf(labels[0]!);
  return i >= 0 ? out.scores[i]! : 0;
}

export async function scoreQuestions(
  zs: ZeroShotPipeline,
  questions: ModelQuestion[],
  text: string,
): Promise<ModelScores> {
  const scores: ModelScores = {};
  for (const q of questions) scores[q] = await scoreQuestion(zs, q, text);
  return scores;
}
