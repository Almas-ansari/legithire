/**
 * Background logic shared by Chrome and Safari: routes model requests,
 * caches model scores per post for the browser session, and stores stats,
 * feedback and dataset records. Makes no network requests. Each browser
 * supplies its own way of running the model.
 */
import type { BackgroundToOffscreen, ContentToBackground, ScoreReply } from '../messages';
import { loadSettings } from '../settings';
import { put } from '../storage/db';
import { addSeen, type DayStats } from '../storage/stats';
import type { ModelQuestion, ModelScores } from '../types';

/** Scores only the given questions for one post. */
export type Scorer = (text: string, questions: ModelQuestion[]) => Promise<ScoreReply>;

/** chrome.storage.session where available; an in-memory map otherwise. */
const memory = new Map<string, ModelScores>();
const session = {
  async get(key: string): Promise<ModelScores> {
    if (chrome.storage.session) return ((await chrome.storage.session.get(key))[key] ?? {}) as ModelScores;
    return memory.get(key) ?? {};
  },
  async set(key: string, value: ModelScores): Promise<void> {
    if (chrome.storage.session) await chrome.storage.session.set({ [key]: value });
    else memory.set(key, value);
  },
};

export function startBackground(scorer: Scorer): void {
  chrome.runtime.onInstalled.addListener(async () => {
    // Fill in defaults only for settings the user hasn't set.
    const stored = await chrome.storage.local.get(null);
    const defaults = await loadSettings();
    const missing = Object.fromEntries(Object.entries(defaults).filter(([k]) => !(k in stored)));
    if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  });

  async function score(postId: string, text: string, questions: ModelQuestion[]): Promise<ScoreReply> {
    const key = `m:${postId}`;
    const cached = await session.get(key);
    const missing = questions.filter((q) => cached[q] === undefined);
    if (missing.length) {
      const reply = await scorer(text, missing);
      if (!reply.ok) return reply;
      Object.assign(cached, reply.scores);
      await session.set(key, cached);
    }
    const scores: ModelScores = {};
    for (const q of questions) scores[q] = cached[q];
    return { ok: true, scores };
  }

  // Serialise stat updates so concurrent "seen" messages don't lose counts.
  let statsChain: Promise<unknown> = Promise.resolve();
  const seenThisSession = new Set<string>();

  async function handle(msg: ContentToBackground): Promise<unknown> {
    switch (msg.type) {
      case 'score':
        return score(msg.postId, msg.text, msg.questions);
      case 'seen':
        if (seenThisSession.has(msg.postId)) return { ok: true };
        seenThisSession.add(msg.postId);
        statsChain = statsChain.then(async () => {
          const { stats } = (await chrome.storage.local.get('stats')) as { stats?: DayStats };
          await chrome.storage.local.set({ stats: addSeen(stats, msg.label) });
        });
        await statsChain;
        return { ok: true };
      case 'feedback':
        await put('feedback', msg.record);
        return { ok: true };
      case 'dataset':
        await put('dataset', msg.record);
        return { ok: true };
    }
  }

  chrome.runtime.onMessage.addListener((msg: ContentToBackground | BackgroundToOffscreen, _sender, sendResponse) => {
    if (!msg || 'target' in msg) return false; // offscreen traffic
    handle(msg).then(sendResponse, (err: unknown) => sendResponse({ ok: false, error: String(err) }));
    return true;
  });
}
