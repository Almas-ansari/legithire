/**
 * Content script. Watches the feed for posts, labels each one shortly before
 * it scrolls into view, and never touches LinkedIn beyond inserting the badge.
 *
 * Rules label a post instantly. When the rules can't decide, the post text is
 * sent to the extension's own offscreen model (on this device) and the label
 * is updated when the answer comes back.
 */
import { decide, pendingQuestions } from '../decide/decide';
import type { ContentToBackground, ScoreReply } from '../messages';
import { anonymize } from '../rules/anonymize';
import { extractFeatures } from '../rules/features';
import { DEFAULT_SETTINGS, loadSettings, type Settings } from '../settings';
import type { Decision, Features, Label, ModelScores, PostData } from '../types';
import { BADGE_ATTR, createBadge } from './badge';
import { badgeSlot, diagnose, extractPost, findPosts, personNames } from './extract';

/** Label posts this far before they enter the viewport so the insert happens off-screen. */
const PRELOAD_MARGIN = '800px 0px';
const SCAN_DELAY_MS = 200;
const MAX_CACHE = 2000;
const LOG = '[LegitHire]';

interface Result {
  data: PostData;
  features: Features;
  scores: ModelScores;
  decision: Decision;
  pending: boolean;
}

let settings: Settings = DEFAULT_SETTINGS;
/** After a model failure, use rules only until this time, then try the model again. */
let modelRetryAt = 0;
const MODEL_RETRY_MS = 30_000;
const seen = new WeakSet<Element>();
const resultByPost = new WeakMap<Element, Result>();
const cacheById = new Map<string, Result>();
const reported = new Set<string>();

function send<T>(msg: ContentToBackground): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function remember(r: Result) {
  cacheById.set(r.data.id, r);
  if (cacheById.size > MAX_CACHE) cacheById.delete(cacheById.keys().next().value!);
}

/** True when the first opaque background behind `el` is dark (LinkedIn's own dark theme). */
function onDarkBackground(el: Element): boolean {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g);
    if (!m || (m.length === 4 && Number(m[3]) === 0)) continue;
    const [r, g, b] = m.map(Number) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  }
  return false;
}

function render(post: HTMLElement, r: Result) {
  post.querySelectorAll(`[${BADGE_ATTR}]`).forEach((b) => b.remove());
  if (!settings.enabled || !post.isConnected) return;
  if (r.decision.label === 'not_hiring' && settings.hideNotHiring) return;

  const { parent, before } = badgeSlot(post);
  const badge = createBadge(r.decision, {
    pending: r.pending,
    dark: onDarkBackground(parent),
    onCorrect: async (corrected: Label) => {
      await send({
        type: 'feedback',
        record: {
          post_id_hash: await sha256(r.data.id),
          predicted_label: r.decision.label,
          corrected_label: corrected,
          features: r.features,
          created_at: new Date().toISOString(),
        },
      });
    },
    onSave: settings.datasetMode
      ? async () => {
          await send({
            type: 'dataset',
            record: {
              post_id_hash: await sha256(r.data.id),
              text: anonymize(r.data.text, personNames(post)),
              features: r.features,
              predicted_label: r.decision.label,
              gold_label: '',
              saved_at: new Date().toISOString(),
            },
          });
        }
      : undefined,
  });
  parent.insertBefore(badge, before);
}

function finish(post: HTMLElement, r: Result) {
  resultByPost.set(post, r);
  remember(r);
  render(post, r);
  if (!r.pending && !reported.has(r.data.id)) {
    reported.add(r.data.id);
    void send({ type: 'seen', postId: r.data.id, label: r.decision.label }).catch(() => undefined);
    if (settings.debug) {
      console.log(LOG, r.decision.label, {
        post: r.data,
        features: r.features,
        modelScores: r.scores,
        decision: r.decision,
      });
    }
  }
}

/** Ask the offscreen model the questions the rules could not settle (at most two rounds). */
async function askModel(r: Result): Promise<Result> {
  const scores: ModelScores = { ...r.scores };
  for (let round = 0; round < 2; round++) {
    const questions = pendingQuestions(r.features, scores, r.data.text.length);
    if (!questions.length) break;
    const reply = await send<ScoreReply>({ type: 'score', postId: r.data.id, text: r.data.text, questions });
    if (!reply?.ok) throw new Error(reply?.error ?? 'no reply');
    Object.assign(scores, reply.scores);
  }
  return { ...r, scores, decision: decide(r.features, scores), pending: false };
}

async function process(post: HTMLElement) {
  const data = extractPost(post);
  if (!data) return;
  const cached = cacheById.get(data.id);
  if (cached && !cached.pending) return finish(post, cached);

  const features = extractFeatures(data);
  const rules: Result = { data, features, scores: {}, decision: decide(features), pending: false };
  const questions = Date.now() < modelRetryAt ? [] : pendingQuestions(features, {}, data.text.length);
  if (!questions.length) return finish(post, rules);

  // Show the rules label while the model works, unless the model may decide
  // this isn't a hiring post at all (then wait, to avoid a label that vanishes).
  if (!questions.includes('hiring')) {
    const interim = { ...rules, pending: true };
    resultByPost.set(post, interim);
    render(post, interim);
  }

  try {
    finish(post, await askModel(rules));
  } catch (err) {
    modelRetryAt = Date.now() + MODEL_RETRY_MS;
    if (settings.debug) console.warn(LOG, 'model unavailable, using rules only:', err);
    finish(post, rules);
  }
}

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      void process(e.target as HTMLElement);
    }
  },
  { rootMargin: PRELOAD_MARGIN },
);

let lastCount = -1;
function scan() {
  if (!settings.enabled) return;
  const posts = findPosts(document);
  if (settings.debug && posts.length !== lastCount) {
    lastCount = posts.length;
    console.log(LOG, `${posts.length} posts on the page`);
  }
  for (const post of posts) {
    if (!seen.has(post)) {
      seen.add(post);
      io.observe(post);
      continue;
    }
    // LinkedIn sometimes re-renders a post's insides and drops our badge.
    const r = resultByPost.get(post);
    if (r && !post.querySelector(`[${BADGE_ATTR}]`)) render(post, r);
  }
}

let scanTimer: number | undefined;
function scheduleScan() {
  if (scanTimer !== undefined) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = undefined;
    scan();
  }, SCAN_DELAY_MS);
}

function rerenderAll() {
  for (const post of findPosts(document)) {
    const r = resultByPost.get(post);
    if (r) render(post, r);
  }
  scan();
}

async function main() {
  settings = await loadSettings();
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !Object.keys(changes).some((k) => k in DEFAULT_SETTINGS)) return;
    settings = await loadSettings();
    rerenderAll();
  });
  new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
  scan();
  if (settings.debug) {
    console.log(LOG, 'running on', location.pathname);
    // If the feed layout isn't recognised, print a structure summary (no post text or names).
    window.setTimeout(() => {
      if (lastCount <= 0) console.log(LOG, 'no posts recognised; layout summary:', JSON.stringify(diagnose(document)));
    }, 5000);
  }
}

void main();
