import { LABEL_TEXT } from '../decide/reasons';
import { LABEL_ORDER } from '../content/badge';
import { loadSettings, type Settings } from '../settings';
import { all, count, toJsonl, type StoreName } from '../storage/db';
import { loadStats } from '../storage/stats';

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

async function renderStats() {
  const { counts } = await loadStats();
  const list = document.getElementById('stats')!;
  const rows = LABEL_ORDER.filter((l) => counts[l]).map((l) => {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('span'), { textContent: LABEL_TEXT[l] }));
    li.append(Object.assign(document.createElement('span'), { textContent: String(counts[l]) }));
    return li;
  });
  if (!rows.length) rows.push(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'No posts labelled yet today.' }));
  list.replaceChildren(...rows);
}

async function renderCounts() {
  for (const store of ['feedback', 'dataset'] as StoreName[]) {
    const n = await count(store);
    document.getElementById(`n-${store}`)!.textContent = String(n);
    (document.getElementById(`export-${store}`) as HTMLButtonElement).disabled = n === 0;
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function main() {
  const settings = await loadSettings();
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-key]')) {
    const key = input.dataset.key as BoolKey;
    input.checked = settings[key];
    input.addEventListener('change', () => chrome.storage.local.set({ [key]: input.checked }));
  }
  for (const store of ['feedback', 'dataset'] as StoreName[]) {
    document.getElementById(`export-${store}`)!.addEventListener('click', async () => {
      const date = new Date().toISOString().slice(0, 10);
      download(`legithire-${store}-${date}.jsonl`, toJsonl(await all(store)));
    });
  }
  await Promise.all([renderStats(), renderCounts()]);
}

void main();
