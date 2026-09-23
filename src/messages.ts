/** Messages between content script, service worker, offscreen document and popup. */
import type { Features, Label, ModelQuestion, ModelScores } from './types';

export interface FeedbackRecord {
  post_id_hash: string;
  predicted_label: Label;
  corrected_label: Label;
  features: Features;
  created_at: string;
}

export interface DatasetRecord {
  post_id_hash: string;
  /** Author names, profile URLs and email addresses removed. */
  text: string;
  features: Features;
  predicted_label: Label;
  gold_label: '';
  saved_at: string;
}

export type ContentToBackground =
  | { type: 'score'; postId: string; text: string; questions: ModelQuestion[] }
  | { type: 'seen'; postId: string; label: Label }
  | { type: 'feedback'; record: FeedbackRecord }
  | { type: 'dataset'; record: DatasetRecord };

export type ScoreReply = { ok: true; scores: ModelScores } | { ok: false; error: string };

export interface BackgroundToOffscreen {
  target: 'offscreen';
  type: 'score';
  text: string;
  questions: ModelQuestion[];
}
