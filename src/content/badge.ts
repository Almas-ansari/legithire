/**
 * The label pill. Rendered inside a closed Shadow DOM so LinkedIn's CSS never
 * reaches it and ours never leaks out. Hover or click shows the reason line;
 * "Wrong label?" lets the user pick the right one; dataset mode adds "Save".
 */
import { LABEL_TEXT, reasonLine } from '../decide/reasons';
import type { Decision, Label } from '../types';

export const BADGE_ATTR = 'data-legithire';

export const LABEL_ORDER: Label[] = [
  'apply_early',
  'real_opening',
  'crowded',
  'engagement_bait',
  'scam_risk',
  'unverified',
  'not_hiring',
];

const COLORS: Record<Label, { bg: string; fg: string; border: string }> = {
  apply_early: { bg: '#e6f4ea', fg: '#137333', border: '#137333' },
  real_opening: { bg: '#e8f0fe', fg: '#1a56c4', border: '#1a56c4' },
  crowded: { bg: '#fef7e0', fg: '#8a5a00', border: '#b98900' },
  engagement_bait: { bg: '#feefe3', fg: '#b3470f', border: '#c5580f' },
  scam_risk: { bg: '#fce8e6', fg: '#b3261e', border: '#b3261e' },
  unverified: { bg: 'transparent', fg: '#5f6368', border: '#9aa0a6' },
  not_hiring: { bg: '#f1f3f4', fg: '#80868b', border: '#e3e5e8' },
};

const STYLE = `
:host { all: initial; display: block; font: 12px/1.3 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 16px 0; min-height: 22px; color: #5f6368; }
button { font: inherit; cursor: pointer; }
.pill {
  display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--bg); color: var(--fg);
  font-weight: 600; white-space: nowrap;
}
.pill:focus-visible, .link:focus-visible, .chip:focus-visible { outline: 2px solid #0a66c2; outline-offset: 1px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .5; animation: pulse 1s ease-in-out infinite alternate; }
@keyframes pulse { to { opacity: .1; } }
.reason { flex: 1 1 200px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.link { border: 0; background: none; padding: 0; color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.save { border: 1px solid currentColor; background: none; border-radius: 10px; height: 20px; padding: 0 8px; color: inherit; }
.save:disabled { cursor: default; }
.picker { display: flex; flex-wrap: wrap; gap: 4px; flex-basis: 100%; padding-top: 2px; }
.chip { border: 1px solid var(--c-border); background: var(--c-bg); color: var(--c-fg); border-radius: 10px; height: 20px; padding: 0 8px; }
.note { font-style: italic; }
[hidden] { display: none !important; }
.row.dark { color: #c4c7ca; }
`;

export interface BadgeOptions {
  /** Model still working on this post. */
  pending?: boolean;
  /** LinkedIn is in dark theme (its own setting, not the OS one). */
  dark?: boolean;
  onCorrect?: (label: Label) => Promise<void>;
  onSave?: () => Promise<void>;
}

function colorVars(el: HTMLElement, label: Label, prefix = '') {
  const c = COLORS[label];
  el.style.setProperty(`--${prefix}bg`, c.bg);
  el.style.setProperty(`--${prefix}fg`, c.fg);
  el.style.setProperty(`--${prefix}border`, c.border);
}

function button(className: string, text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  return b;
}

/** Keeps clicks inside the badge from reaching LinkedIn's handlers or opening the post. */
function isolate(el: HTMLElement) {
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown']) {
    el.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === 'click') e.preventDefault();
    });
  }
}

export function createBadge(decision: Decision, opts: BadgeOptions = {}): HTMLElement {
  const host = document.createElement('div');
  host.setAttribute(BADGE_ATTR, decision.label);
  if (opts.pending) host.setAttribute(`${BADGE_ATTR}-pending`, '');
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = STYLE;

  const row = document.createElement('div');
  row.className = opts.dark ? 'row dark' : 'row';
  colorVars(row, decision.label);
  isolate(row);

  const line = reasonLine(decision.reasons);
  const pill = button('pill', '');
  if (opts.pending) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    pill.append(dot);
  }
  pill.append(LABEL_TEXT[decision.label]);
  pill.title = opts.pending ? `${line} (checking with the on-device model…)` : line;
  pill.setAttribute('aria-expanded', 'false');

  const reason = document.createElement('span');
  reason.className = 'reason';
  reason.textContent = line;
  reason.title = line;
  reason.hidden = true;

  // Hover shows the reason; a click pins it open until the next click.
  let pinned = false;
  const show = (visible: boolean) => {
    reason.hidden = !visible;
    pill.setAttribute('aria-expanded', String(visible));
  };
  pill.addEventListener('mouseenter', () => show(true));
  pill.addEventListener('mouseleave', () => show(pinned));
  pill.addEventListener('focus', () => show(true));
  pill.addEventListener('blur', () => show(pinned));
  pill.addEventListener('click', () => {
    pinned = !pinned;
    show(pinned);
  });

  row.append(pill, reason);

  if (opts.onCorrect && !opts.pending) {
    const wrong = button('link', 'Wrong label?');
    const picker = document.createElement('div');
    picker.className = 'picker';
    picker.hidden = true;
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Pick the right label');
    for (const label of LABEL_ORDER) {
      if (label === decision.label) continue;
      const chip = button('chip', LABEL_TEXT[label]);
      colorVars(chip, label, 'c-');
      chip.addEventListener('click', async () => {
        picker.replaceChildren(Object.assign(document.createElement('span'), { className: 'note', textContent: 'Saving…' }));
        try {
          await opts.onCorrect!(label);
          picker.firstElementChild!.textContent = `Thanks, saved on this device as "${LABEL_TEXT[label]}".`;
        } catch {
          picker.firstElementChild!.textContent = 'Could not save. Try reloading the page.';
        }
        wrong.hidden = true;
      });
      picker.append(chip);
    }
    wrong.addEventListener('click', () => {
      picker.hidden = !picker.hidden;
      if (!picker.hidden) show(true);
    });
    row.append(wrong, picker);
  }

  if (opts.onSave && !opts.pending) {
    const save = button('save', 'Save to dataset');
    save.addEventListener('click', async () => {
      save.disabled = true;
      save.textContent = 'Saving…';
      try {
        await opts.onSave!();
        save.textContent = 'Saved';
      } catch {
        save.textContent = 'Save failed';
        save.disabled = false;
      }
    });
    row.append(save);
  }

  root.append(style, row);
  return host;
}
