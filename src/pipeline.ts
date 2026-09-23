import { decide, pendingQuestions } from './decide/decide';
import { extractFeatures } from './rules/features';
import type { Decision, Features, ModelQuestion, ModelScores, PostData } from './types';

/** Anything that can answer a model question with a probability in [0, 1]. */
export interface Classifier {
  score(question: ModelQuestion, text: string): Promise<number>;
}

export interface Classification {
  decision: Decision;
  features: Features;
  scores: ModelScores;
}

/** Rules only: instant, no model. Ambiguous posts fall back to the keyword rules. */
export function classifyRules(post: PostData): Classification {
  const features = extractFeatures(post);
  return { features, scores: {}, decision: decide(features) };
}

/** Full pipeline: rules first, then only the model questions the rules could not settle. */
export async function classify(post: PostData, classifier?: Classifier): Promise<Classification> {
  const features = extractFeatures(post);
  const scores: ModelScores = {};
  if (classifier) {
    // At most two rounds: the hiring question, then the Stage 3 questions.
    for (let round = 0; round < 2; round++) {
      const questions = pendingQuestions(features, scores, post.text.length);
      if (!questions.length) break;
      for (const q of questions) scores[q] = await classifier.score(q, post.text);
    }
  }
  return { features, scores, decision: decide(features, scores) };
}
