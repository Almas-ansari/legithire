/**
 * Loads the bundled model inside an extension page (Chrome's offscreen
 * document, Safari's background page) and scores one post at a time.
 * Loads nothing from the network: model files and the ONNX Runtime
 * WebAssembly are part of the extension package.
 */
import { env, pipeline } from '@huggingface/transformers';
import { MODEL_DTYPE, MODEL_ID } from '../config';
import type { ModelQuestion, ModelScores } from '../types';
import { scoreQuestions, type ZeroShotPipeline } from './zeroShot';

export type ModelScorer = (questions: ModelQuestion[], text: string) => Promise<ModelScores>;

export function createBrowserModel(): ModelScorer {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = chrome.runtime.getURL('models/');
  env.useBrowserCache = false;
  env.useWasmCache = false;

  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number; proxy?: boolean } };
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = {
      mjs: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.mjs'),
      wasm: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.wasm'),
    };
    onnx.wasm.numThreads = 1; // no cross-origin isolation in extension pages, so no SharedArrayBuffer threads
    onnx.wasm.proxy = false;
  }

  let model: Promise<ZeroShotPipeline> | null = null;
  const load = () => {
    model ??= pipeline('zero-shot-classification', MODEL_ID, { dtype: MODEL_DTYPE, device: 'wasm' }).then(
      (p) => p as unknown as ZeroShotPipeline,
    );
    model.catch(() => (model = null)); // allow a retry after a failed load
    return model;
  };

  // One post at a time.
  let queue: Promise<unknown> = Promise.resolve();
  return (questions, text) => {
    const job = queue.then(async () => scoreQuestions(await load(), questions, text));
    queue = job.catch(() => undefined);
    return job;
  };
}
