/**
 * Chrome service worker. Service workers can't run the WebAssembly model
 * (no dynamic import), so the model lives in an offscreen document.
 */
import type { BackgroundToOffscreen, ScoreReply } from '../messages';
import { startBackground } from './core';

let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Runs the bundled text classifier (WebAssembly) on-device, away from the page.',
    })
    .finally(() => (creating = null));
  await creating;
}

/**
 * A freshly created offscreen document needs a moment to load its script and
 * register its listener; until then sendMessage fails with "Receiving end does
 * not exist". Retry for a few seconds.
 */
async function sendToOffscreen(msg: BackgroundToOffscreen): Promise<ScoreReply | undefined> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await chrome.runtime.sendMessage(msg)) as ScoreReply | undefined;
    } catch (err) {
      if (attempt >= 50 || !String(err).includes('Receiving end does not exist')) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

startBackground(async (text, questions) => {
  await ensureOffscreen();
  const reply = await sendToOffscreen({ target: 'offscreen', type: 'score', text, questions });
  return reply ?? { ok: false, error: 'Model did not respond' };
});
