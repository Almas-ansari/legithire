/**
 * Safari background page. Safari has no offscreen documents, but its
 * (non-persistent) background page is a full page, so the model runs right
 * here, still away from LinkedIn's main thread.
 */
import { createBrowserModel } from '../model/browserModel';
import { startBackground } from './core';

const score = createBrowserModel();

startBackground(async (text, questions) => {
  try {
    return { ok: true, scores: await score(questions, text) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
