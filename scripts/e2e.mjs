/**
 * End-to-end check in real Chrome with the packaged extension (dist/).
 * https://www.linkedin.com/feed/ is intercepted and answered locally with the
 * fixture posts, so no request ever reaches LinkedIn. Verifies: posts found,
 * badges rendered, the offscreen model answers, and extension pages make no
 * network requests.
 *   npm run build && npm run e2e
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = resolve('dist');
const SHOT = process.env.SHOT ?? 'e2e.png';

const posts = readdirSync('fixtures/posts')
  .filter((f) => f.endsWith('.html'))
  .sort()
  .map((f) => `<section class="card">${readFileSync(`fixtures/posts/${f}`, 'utf8')}</section>`);
const page = `<!doctype html><meta charset="utf-8"><title>Feed</title>
<style>body{font:14px system-ui;background:#f4f2ee;margin:0;padding:16px}
.card{background:#fff;border-radius:8px;margin:0 auto 12px;max-width:555px;padding:12px 0;box-shadow:0 0 0 1px #0000001a}
.card main{display:block}.feed-shared-inline-show-more-text{max-height:100px;overflow:hidden}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style>
<div id="feed">${posts.join('\n')}</div>`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  pipe: true,
  enableExtensions: [DIST],
  args: ['--no-first-run', '--no-default-browser-check'],
});

const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exitCode = 1;
};

try {
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), { timeout: 15000 });
  const extId = new URL(swTarget.url()).host;
  console.log('extension id', extId);

  // Turn on debug so the content script logs its decisions.
  const sw = await swTarget.worker();
  await new Promise((r) => setTimeout(r, 1000)); // let onInstalled write its defaults first
  await sw.evaluate(() => chrome.storage.local.set({ enabled: true, hideNotHiring: false, debug: true, datasetMode: true }));

  // Watch every request made by extension targets (offscreen, popup, worker).
  const external = [];
  browser.on('targetcreated', async (t) => {
    if (!t.url().startsWith(`chrome-extension://${extId}`)) return;
    const s = await t.createCDPSession().catch(() => null);
    if (!s) return;
    await s.send('Network.enable').catch(() => {});
    s.on('Network.requestWillBeSent', (e) => {
      if (!/^(chrome-extension|data|blob):/.test(e.request.url)) external.push(e.request.url);
    });
  });

  const tab = await browser.newPage();
  await tab.setViewport({ width: 800, height: 2400 });
  await tab.setRequestInterception(true);
  tab.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('https://www.linkedin.com/feed')) return req.respond({ status: 200, contentType: 'text/html', body: page });
    if (url.startsWith('https://www.linkedin.com/')) return req.respond({ status: 204, body: '' });
    return req.continue();
  });
  // Content-script logs live in an isolated world; read them over CDP.
  const cdp = await tab.createCDPSession();
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.consoleAPICalled', (e) => {
    const text = e.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (text.startsWith('[LegitHire]') && (e.type === 'warning' || e.type === 'error' || process.env.VERBOSE)) {
      console.log(`  content ${e.type}: ${text.slice(0, 300)}`);
    }
  });

  const t0 = Date.now();
  await tab.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });

  // Every fixture post should end up with a final badge (hideNotHiring is off).
  const expected = ['apply_early', 'engagement_bait', 'not_hiring', 'scam_risk', 'real_opening', 'scam_risk', 'not_hiring'];
  const deadline = Date.now() + 90_000;
  let badges = [];
  while (Date.now() < deadline) {
    badges = await tab.$$eval('[data-legithire]', (els) => els.map((e) => e.getAttribute('data-legithire')));
    const pending = await tab.$$eval('[data-legithire-pending]', (els) => els.length);
    if (badges.length >= expected.length && !pending) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`labelled in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, badges);
  if (JSON.stringify(badges) !== JSON.stringify(expected)) fail(`expected ${JSON.stringify(expected)}`);

  // Posts the rules couldn't settle must have been scored by the model (cached per post in the worker).
  const modelled = await sw.evaluate(async () =>
    Object.keys(await chrome.storage.session.get(null)).filter((k) => k.startsWith('m:')).length,
  );
  console.log('posts scored by the model:', modelled);
  if (modelled < 2) fail('expected the model to score at least 2 fixture posts (02 and 05)');

  // Ask the model directly through the service worker, like the content script does.
  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  const probe = await popup.evaluate(async () => {
    const t = Date.now();
    const reply = await chrome.runtime.sendMessage({
      type: 'score',
      postId: 'e2e-probe',
      text: 'We are hiring a backend engineer in Pune. Comment "interested" and follow me to get the referral link.',
      questions: ['hiring', 'bait', 'scam'],
    });
    return { reply, ms: Date.now() - t };
  });
  console.log('model probe:', JSON.stringify(probe));
  if (!probe.reply?.ok) fail('model did not answer: ' + JSON.stringify(probe.reply));

  // --- Phase 3 interactions. Badges use a closed shadow root; reach in over CDP.
  await tab.bringToFront();
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const hosts = [];
  (function walk(n) {
    if (n.attributes?.includes('data-legithire')) hosts.push(n);
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) walk(c);
  })(root);
  async function clickInBadge(host, selector, text) {
    const shadow = host.shadowRoots?.[0];
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: shadow.nodeId, selector });
    for (const nodeId of nodeIds) {
      const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId });
      if (text && !outerHTML.includes(text)) continue;
      await cdp.send('DOM.scrollIntoViewIfNeeded', { nodeId });
      const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
      const [x1, y1, , , x3, y3] = model.content;
      await tab.mouse.click((x1 + x3) / 2, (y1 + y3) / 2);
      await new Promise((r) => setTimeout(r, 300));
      return true;
    }
    return false;
  }
  const labelOf = (h) => h.attributes[h.attributes.indexOf('data-legithire') + 1];
  const early = hosts.find((h) => labelOf(h) === 'apply_early');
  const scamSdui = hosts.filter((h) => labelOf(h) === 'scam_risk')[1]; // the SDUI cook post
  if (!(await clickInBadge(early, 'button.link'))) fail('no "Wrong label?" link');
  // Re-read the shadow tree after the picker opened.
  const { root: root2 } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const hosts2 = [];
  (function walk(n) {
    if (n.attributes?.includes('data-legithire')) hosts2.push(n);
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) walk(c);
  })(root2);
  if (!(await clickInBadge(hosts2.find((h) => labelOf(h) === 'apply_early'), 'button.chip', 'Crowded'))) fail('no "Crowded" chip');
  if (!(await clickInBadge(hosts2.filter((h) => labelOf(h) === 'scam_risk')[1] ?? scamSdui, 'button.save'))) fail('no "Save to dataset" button');
  await new Promise((r) => setTimeout(r, 500));

  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('n-feedback').textContent !== '0', { timeout: 5000 }).catch(() => {});
  const popupState = await popup.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('legithire');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const getAll = (store) =>
      new Promise((res) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => res(r.result);
      });
    return {
      feedbackCount: document.getElementById('n-feedback').textContent,
      datasetCount: document.getElementById('n-dataset').textContent,
      stats: document.getElementById('stats').innerText.replace(/\s+/g, ' '),
      feedback: await getAll('feedback'),
      dataset: await getAll('dataset'),
    };
  });
  console.log('popup:', popupState.feedbackCount, 'feedback,', popupState.datasetCount, 'dataset; seen today:', popupState.stats);
  if (popupState.feedbackCount !== '1' || popupState.datasetCount !== '1') fail('popup counts should both be 1');
  const fb = popupState.feedback[0];
  if (!fb || fb.predicted_label !== 'apply_early' || fb.corrected_label !== 'crowded' || !/^[0-9a-f]{64}$/.test(fb.post_id_hash)) {
    fail('feedback record wrong: ' + JSON.stringify(fb)?.slice(0, 200));
  } else console.log('feedback record ok:', Object.keys(fb).join(', '));
  const ds = popupState.dataset[0];
  if (!ds) fail('no dataset record');
  else {
    console.log('dataset text:', JSON.stringify(ds.text.slice(0, 160)));
    if (/Robin|\+64 21/.test(JSON.stringify(ds))) fail('dataset record leaks a name or phone number');
    if (ds.gold_label !== '') fail('gold_label should be empty');
  }
  if (/Robin|Jordan|Rivera/.test(JSON.stringify(fb))) fail('feedback record leaks a name');

  if (external.length) fail('extension made network requests: ' + external.join(', '));
  else console.log('network: extension pages made no external requests');

  await tab.bringToFront();
  await tab.screenshot({ path: SHOT, fullPage: true });
  console.log('screenshot:', SHOT);
} finally {
  await browser.close();
}
