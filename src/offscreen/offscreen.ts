/**
 * Chrome offscreen document: hosts the model, in its own process, so
 * inference never touches LinkedIn's main thread.
 */
import type { BackgroundToOffscreen, ScoreReply } from '../messages';
import { createBrowserModel } from '../model/browserModel';

const score = createBrowserModel();

chrome.runtime.onMessage.addListener((msg: BackgroundToOffscreen, _sender, sendResponse: (r: ScoreReply) => void) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'score') return false;
  score(msg.questions, msg.text).then(
    (scores) => sendResponse({ ok: true, scores }),
    (err: unknown) => sendResponse({ ok: false, error: String(err) }),
  );
  return true;
});
