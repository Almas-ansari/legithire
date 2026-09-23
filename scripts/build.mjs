/**
 * Builds the extension.
 *   node scripts/build.mjs                   # Chrome  -> dist/
 *   node scripts/build.mjs --target safari   # Safari  -> safari/extension/
 *   add --watch to rebuild on change
 *
 * Chrome runs the model in an offscreen document; Safari has no offscreen API,
 * so there the model runs in the (non-persistent) background page instead.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const target = process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : 'chrome';
if (!['chrome', 'safari'].includes(target)) throw new Error(`Unknown --target ${target}`);
const safari = target === 'safari';
const outdir = safari ? 'safari/extension' : 'dist';

const entries = safari
  ? [
      { in: 'src/content/index.ts', out: 'content', format: 'iife' },
      { in: 'src/background/safari.ts', out: 'background', format: 'iife' },
      { in: 'src/popup/popup.ts', out: 'popup', format: 'iife' },
    ]
  : [
      { in: 'src/content/index.ts', out: 'content', format: 'iife' },
      { in: 'src/background/sw.ts', out: 'background', format: 'esm' },
      { in: 'src/popup/popup.ts', out: 'popup', format: 'iife' },
      { in: 'src/offscreen/offscreen.ts', out: 'offscreen', format: 'esm' },
    ];

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
cpSync('public', outdir, { recursive: true });

// Browser-specific manifest.
const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
if (safari) {
  rmSync(`${outdir}/offscreen.html`);
  manifest.permissions = manifest.permissions.filter((p) => p !== 'offscreen');
  manifest.background = { scripts: ['background.js'], persistent: false };
  manifest.browser_specific_settings = { safari: { strict_min_version: '16.4' } };
}
writeFileSync(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

// The model and the ONNX Runtime WebAssembly are bundled; nothing is fetched at runtime.
const MODEL_ID = readFileSync('src/config.ts', 'utf8').match(/MODEL_ID\s*=\s*'([^']+)'/)[1];
if (!existsSync(`models/${MODEL_ID}`)) {
  console.error(`Model files missing: run \`npm run fetch-model\` first (models/${MODEL_ID}).`);
  process.exit(1);
}
cpSync(`models/${MODEL_ID}`, `${outdir}/models/${MODEL_ID}`, { recursive: true });
mkdirSync(`${outdir}/ort`, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  cpSync(`node_modules/onnxruntime-web/dist/${f}`, `${outdir}/ort/${f}`);
}

const contexts = await Promise.all(
  entries.map((e) =>
    esbuild.context({
      entryPoints: [{ in: e.in, out: e.out }],
      outdir,
      bundle: true,
      format: e.format,
      target: safari ? 'safari16' : 'chrome120',
      sourcemap: watch ? 'inline' : false,
      minify: !watch,
      logLevel: 'warning',
      // Transformers.js imports the WebGPU build of ONNX Runtime; we only run on
      // CPU, so use the smaller WASM-only build and load its .wasm from ort/.
      alias: { 'onnxruntime-web/webgpu': 'onnxruntime-web/wasm' },
      conditions: ['onnxruntime-web-use-extern-wasm'],
      // The IIFE Safari background has no import.meta; nothing we use needs it
      // (model and wasm paths are set explicitly).
      define: e.format === 'iife' ? { 'import.meta.url': 'undefined' } : {},
    }),
  ),
);

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
  console.log(`built ${target} -> ${outdir}/`);
}
