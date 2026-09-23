/**
 * Downloads the model once, at development/build time, into models/.
 * The extension itself never makes network requests: it loads these files
 * from its own package. Re-run after changing MODEL_ID in src/config.ts.
 *   npm run fetch-model                 # the model in src/config.ts
 *   npm run fetch-model -- <model-id>   # another one, e.g. to compare with eval --model
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const config = readFileSync('src/config.ts', 'utf8');
const MODEL_ID = process.argv[2] ?? config.match(/MODEL_ID\s*=\s*'([^']+)'/)?.[1];
const DTYPE = config.match(/MODEL_DTYPE\s*=\s*'([^']+)'/)?.[1] ?? 'q8';
if (!MODEL_ID) throw new Error('MODEL_ID not found in src/config.ts');

const SUFFIX = { fp32: '', fp16: '_fp16', q8: '_quantized', int8: '_int8', uint8: '_uint8', q4: '_q4' }[DTYPE] ?? '_quantized';
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', `onnx/model${SUFFIX}.onnx`];
const OPTIONAL = ['special_tokens_map.json', 'vocab.txt'];

async function get(file, required) {
  const out = join('models', MODEL_ID, file);
  if (existsSync(out) && statSync(out).size > 0) return console.log('ok  ', out);
  const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${file}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (required) throw new Error(`${res.status} ${url}`);
    return console.log('skip', file, res.status);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('got ', out, `${(statSync(out).size / 1e6).toFixed(1)} MB`);
}

for (const f of FILES) await get(f, true);
for (const f of OPTIONAL) await get(f, false);
