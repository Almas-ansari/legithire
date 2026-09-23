/**
 * Evaluate the full pipeline (rules + zero-shot model) on labelled posts.
 *
 *   npm run eval -- --split dev            # accuracy, per-label P/R, confusion matrix
 *   npm run eval -- --split test           # final number; never tune on this
 *   npm run eval -- --split dev --sweep    # search model thresholds (dev only)
 *   npm run eval -- --no-model             # rules only
 *   npm run eval -- --file data/my.jsonl --verbose
 *   npm run eval -- --model Xenova/nli-deberta-v3-xsmall   # compare another model (fetch it first)
 *
 * Input: JSONL, one post per line:
 *   { "text": "...", "gold_label": "scam_risk", "split": "dev" | "test",
 *     "features": {...} }                  // as exported by dataset mode, or
 *   { "text": "...", "gold_label": "...", "meta": { "ageHours": 5, "comments": 12,
 *     "reactions": 40, "reposts": 0, "headline": "...", "links": [{ "href", "text" }],
 *     "emails": [] } }
 * Records without "split" are assigned by a stable hash of the text (80% dev, 20% test).
 * Runs entirely offline from models/ (npm run fetch-model).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { env, pipeline } from '@huggingface/transformers';
import { MODEL_DTYPE, MODEL_ID as CONFIG_MODEL_ID } from '../src/config';
import { DEFAULT_THRESHOLDS, decideLabel, pendingQuestions, type Thresholds } from '../src/decide/decide';
import { LABEL_TEXT } from '../src/decide/reasons';
import { scoreQuestion, type ZeroShotPipeline } from '../src/model/zeroShot';
import { extractFeatures } from '../src/rules/features';
import type { Features, Label, ModelQuestion, ModelScores, PostData } from '../src/types';

const LABELS = Object.keys(LABEL_TEXT) as Label[];
const QUESTIONS: ModelQuestion[] = ['hiring', 'bait', 'scam'];
const CACHE_FILE = 'data/.model-scores.json';

interface Meta {
  ageHours?: number | null;
  comments?: number | null;
  reactions?: number | null;
  reposts?: number | null;
  headline?: string;
  links?: { href: string; text: string }[];
  emails?: string[];
}
interface Row {
  text: string;
  gold_label: Label;
  split?: 'dev' | 'test';
  features?: Features;
  meta?: Meta;
}

const { values: args } = parseArgs({
  options: {
    file: { type: 'string' },
    split: { type: 'string', default: 'dev' },
    'no-model': { type: 'boolean', default: false },
    sweep: { type: 'boolean', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
    model: { type: 'string' },
  },
});
const MODEL_ID = args.model ?? CONFIG_MODEL_ID;

if (!['dev', 'test', 'all'].includes(args.split!)) throw new Error('--split must be dev, test or all');
if (args.sweep && args.split !== 'dev') {
  console.error('Refusing to sweep thresholds on the test split. Tune on --split dev only.');
  process.exit(1);
}

const file = args.file ?? (existsSync('data/labeled.jsonl') ? 'data/labeled.jsonl' : 'data/synthetic.jsonl');
if (!args.file && file.endsWith('synthetic.jsonl')) {
  console.warn('data/labeled.jsonl not found; using data/synthetic.jsonl (small, synthetic).\n');
}

const splitOf = (r: Row): 'dev' | 'test' =>
  r.split ?? (createHash('sha1').update(r.text).digest()[0]! % 5 === 0 ? 'test' : 'dev');

const parsed: Row[] = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l, i) => {
    const r = JSON.parse(l) as Row;
    if (r.gold_label && !LABELS.includes(r.gold_label)) {
      throw new Error(`${file}:${i + 1}: gold_label "${r.gold_label}" is not one of ${LABELS.join(', ')}`);
    }
    return r;
  });
const unlabelled = parsed.filter((r) => !r.gold_label).length;
if (unlabelled) console.warn(`skipping ${unlabelled} record(s) with an empty gold_label\n`);
const rows = parsed.filter((r) => r.gold_label && (args.split === 'all' || splitOf(r) === args.split));

function featuresOf(r: Row): Features {
  if (r.features) return r.features;
  const m = r.meta ?? {};
  const post: PostData = {
    id: r.text.slice(0, 40),
    text: r.text,
    authorHeadline: m.headline ?? '',
    ageText: null,
    ageHours: m.ageHours ?? null,
    reactions: m.reactions ?? null,
    comments: m.comments ?? null,
    reposts: m.reposts ?? null,
    links: m.links ?? [],
    emails: m.emails ?? [],
  };
  return extractFeatures(post);
}

/* ---------------------------------------------------------- model scores */

const cacheKey = (text: string) => createHash('sha1').update(`${MODEL_ID}|${MODEL_DTYPE}|${text}`).digest('hex');
const cache: Record<string, Partial<Record<ModelQuestion, number>>> = existsSync(CACHE_FILE)
  ? JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
  : {};

async function allScores(texts: string[]): Promise<Map<string, Required<ModelScores>>> {
  const out = new Map<string, Required<ModelScores>>();
  let zs: ZeroShotPipeline | null = null;
  for (const text of texts) {
    const key = cacheKey(text);
    const entry = (cache[key] ??= {});
    for (const q of QUESTIONS) {
      if (entry[q] !== undefined) continue;
      if (!zs) {
        env.allowRemoteModels = false;
        env.localModelPath = 'models/';
        zs = (await pipeline('zero-shot-classification', MODEL_ID, { dtype: MODEL_DTYPE })) as unknown as ZeroShotPipeline;
      }
      entry[q] = await scoreQuestion(zs, q, text);
    }
    out.set(text, entry as Required<ModelScores>);
  }
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return out;
}

/** Exactly what the extension does: ask only the questions the rules leave open. */
function run(f: Features, text: string, all: Required<ModelScores> | undefined, t: Thresholds) {
  const scores: ModelScores = {};
  let calls = 0;
  if (all) {
    for (let round = 0; round < 2; round++) {
      const qs = pendingQuestions(f, scores, text.length, t);
      if (!qs.length) break;
      for (const q of qs) scores[q] = all[q];
      calls += qs.length;
    }
  }
  return { label: decideLabel(f, scores, t), scores, calls };
}

/* --------------------------------------------------------------- metrics */

function metrics(gold: Label[], pred: Label[]) {
  const n = gold.length;
  const correct = gold.filter((g, i) => g === pred[i]).length;
  const per = LABELS.map((l) => {
    const tp = gold.filter((g, i) => g === l && pred[i] === l).length;
    const fp = gold.filter((g, i) => g !== l && pred[i] === l).length;
    const fn = gold.filter((g, i) => g === l && pred[i] !== l).length;
    const p = tp + fp ? tp / (tp + fp) : 0;
    const r = tp + fn ? tp / (tp + fn) : 0;
    return { label: l, p, r, f1: p + r ? (2 * p * r) / (p + r) : 0, support: tp + fn };
  });
  const present = per.filter((x) => x.support > 0);
  const macroF1 = present.reduce((s, x) => s + x.f1, 0) / Math.max(present.length, 1);
  return { accuracy: n ? correct / n : 0, per, macroF1 };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
const short: Record<Label, string> = {
  apply_early: 'early',
  real_opening: 'real',
  crowded: 'crowd',
  engagement_bait: 'bait',
  scam_risk: 'scam',
  unverified: 'unver',
  not_hiring: 'not',
};

function report(gold: Label[], pred: Label[]) {
  const m = metrics(gold, pred);
  console.log(`accuracy ${pct(m.accuracy)}   macro-F1 ${pct(m.macroF1)}   (n=${gold.length})\n`);
  console.log('label                 precision  recall     F1  support');
  for (const x of m.per) {
    console.log(`${LABEL_TEXT[x.label].padEnd(20)} ${pct(x.p)}   ${pct(x.r)} ${pct(x.f1)}  ${String(x.support).padStart(7)}`);
  }
  console.log('\nconfusion matrix (rows = gold, columns = predicted)');
  console.log('        ' + LABELS.map((l) => short[l].padStart(6)).join(''));
  for (const g of LABELS) {
    const row = LABELS.map((p) => String(gold.filter((x, i) => x === g && pred[i] === p).length).padStart(6));
    console.log(short[g].padEnd(8) + row.join(''));
  }
}

/* ------------------------------------------------------------------ main */

const t0 = Date.now();
const feats = rows.map(featuresOf);
const scores = args['no-model'] ? new Map() : await allScores(rows.map((r) => r.text));
const gold = rows.map((r) => r.gold_label);

console.log(`${file} · split=${args.split} · ${args['no-model'] ? 'rules only' : `model ${MODEL_ID} (${MODEL_DTYPE})`}\n`);

if (args.sweep) {
  const grid = (a: number, b: number, s: number) => Array.from({ length: Math.round((b - a) / s) + 1 }, (_, i) => +(a + i * s).toFixed(2));
  const results: { t: Thresholds; f1: number; acc: number }[] = [];
  for (const hiring of grid(0.05, 0.95, 0.05))
    for (const bait of grid(0.5, 0.99, 0.03))
      for (const scam of grid(0.5, 0.99, 0.03)) {
        const t = { hiring, bait, scam };
        const pred = rows.map((r, i) => run(feats[i]!, r.text, scores.get(r.text), t).label);
        const m = metrics(gold, pred);
        results.push({ t, f1: m.macroF1, acc: m.accuracy });
      }
  results.sort((a, b) => b.f1 - a.f1 || b.acc - a.acc || b.t.scam + b.t.bait - (a.t.scam + a.t.bait));
  console.log('top thresholds on dev (macro-F1, then accuracy, then the most conservative):');
  for (const r of results.slice(0, 8)) console.log(`  hiring ${r.t.hiring}  bait ${r.t.bait}  scam ${r.t.scam}   F1 ${pct(r.f1)}  acc ${pct(r.acc)}`);
  console.log('\nbest result at each hiring threshold (how much the Stage 1 model helps or hurts):');
  for (const h of grid(0.05, 0.95, 0.05)) {
    const best = results.find((r) => r.t.hiring === h)!;
    console.log(`  hiring ${h.toFixed(2)}  F1 ${pct(best.f1)}  acc ${pct(best.acc)}`);
  }
  const cur = results.find((r) => JSON.stringify(r.t) === JSON.stringify(DEFAULT_THRESHOLDS));
  if (cur) console.log(`current config: F1 ${pct(cur.f1)} acc ${pct(cur.acc)}`);
} else {
  let calls = 0;
  const pred = rows.map((r, i) => {
    const out = run(feats[i]!, r.text, scores.get(r.text), DEFAULT_THRESHOLDS);
    calls += out.calls;
    if (args.verbose && out.label !== r.gold_label) {
      const s = Object.entries(out.scores).map(([k, v]) => `${k}=${(v as number).toFixed(2)}`).join(' ');
      console.log(`✗ gold ${r.gold_label} → ${out.label}  [${s}]\n   ${r.text.slice(0, 110).replace(/\n/g, ' ')}\n`);
    }
    return out.label;
  });
  report(gold, pred);
  console.log(`\nmodel calls: ${calls} for ${rows.length} posts (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
