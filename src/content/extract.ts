/**
 * Stage 0: read a rendered post into PostData. Read-only: never clicks,
 * scrolls or fetches anything, and never changes LinkedIn's elements.
 */
import { parseAgeHours, parseCount } from '../rules/age';
import type { LinkInfo, PostData } from '../types';
import * as S from './selectors';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Visible label of a control: aria-label, else its text. */
function labelOf(el: Element): string {
  return clean(el.getAttribute('aria-label')) || clean(el.textContent);
}

/* ------------------------------------------------------------------ posts */

function outermostOf(els: Iterable<HTMLElement>): HTMLElement[] {
  const set = new Set(els);
  return [...set].filter((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
    return true;
  });
}

/**
 * Posts found structurally: for each action-bar button of one kind, climb to
 * the largest ancestor that contains no other button of that kind.
 */
export function postsByActionBar(root: ParentNode): HTMLElement[] {
  const scope = (root as Element).querySelector?.(S.FEED_ROOT) ?? root;
  const candidates = [...scope.querySelectorAll<HTMLElement>(S.ACTION_CANDIDATES)];
  let best: HTMLElement[] = [];
  for (const re of Object.values(S.ACTION_KINDS)) {
    const markers = candidates.filter((el) => re.test(labelOf(el)));
    if (markers.length <= best.length) continue;
    const counts = new Map<Element, number>();
    for (const m of markers) {
      for (let p = m.parentElement; p; p = p.parentElement) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const posts = new Set<HTMLElement>();
    for (const m of markers) {
      let el: HTMLElement = m;
      while (
        el.parentElement &&
        !el.parentElement.matches(S.FEED_BOUNDARY) &&
        (counts.get(el.parentElement) ?? 0) === 1
      ) {
        el = el.parentElement;
      }
      if (el !== m) posts.add(el);
    }
    if (posts.size > best.length) best = [...posts];
  }
  return best;
}

/** Post containers under `root`: selector matches where they exist, else structural matches. */
export function findPosts(root: ParentNode): HTMLElement[] {
  const bySelector = outermostOf(root.querySelectorAll<HTMLElement>(S.POST));
  const out = new Set<HTMLElement>(bySelector);
  for (const container of postsByActionBar(root)) {
    // A structural container that wraps selector-found posts adds nothing.
    if (!bySelector.some((p) => container.contains(p) || p.contains(container))) out.add(container);
  }
  return outermostOf(out);
}

/* ---------------------------------------------------------------- helpers */

function inComments(el: Element, post: Element): boolean {
  const c = el.closest(S.COMMENTS);
  return !!c && post.contains(c);
}

/** Outermost matches of `selector` inside `post`, skipping comments. */
function outermost(post: Element, selector: string): HTMLElement[] {
  return [...post.querySelectorAll<HTMLElement>(selector)].filter((el) => {
    if (inComments(el, post)) return false;
    const parent = el.parentElement?.closest(selector);
    return !parent || !post.contains(parent);
  });
}

/** Visible text, with screen-reader duplicates and buttons removed and <br> kept as newlines. */
export function textOf(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(S.TEXT_STRIP).forEach((n) => n.remove());
  copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  copy.querySelectorAll('p, li, div').forEach((b) => b.append('\n'));
  return (copy.textContent ?? '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Small stable hash for posts without an activity URN. */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function activityId(post: HTMLElement): string | null {
  for (const attr of S.ACTIVITY_ID_ATTRS) {
    const m = post.getAttribute(attr)?.match(S.ACTIVITY_ID_RE);
    if (m) return `urn:li:activity:${m[1]}`;
  }
  for (const el of post.querySelectorAll(S.ACTIVITY_ID_CARRIERS)) {
    if (inComments(el, post)) continue;
    for (const attr of S.ACTIVITY_ID_ATTRS) {
      const m = el.getAttribute(attr)?.match(S.ACTIVITY_ID_RE);
      if (m) return `urn:li:activity:${m[1]}`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------- text */

/**
 * Last resort: group text nodes by their nearest block element, take the block
 * with the most prose, then widen to sibling paragraphs.
 */
function proseBlock(post: HTMLElement): HTMLElement | null {
  const doc = post.ownerDocument;
  const walker = doc.createTreeWalker(post, NodeFilter.SHOW_TEXT);
  const sizes = new Map<HTMLElement, number>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = clean(n.nodeValue).length;
    if (!len) continue;
    const parent = n.parentElement;
    if (!parent || parent.closest(S.NOT_TEXT) || inComments(parent, post)) continue;
    const block = parent.closest<HTMLElement>('p, div, li, article, section') ?? parent;
    if (!post.contains(block)) continue;
    sizes.set(block, (sizes.get(block) ?? 0) + len);
  }
  let best: HTMLElement | null = null;
  let bestLen = 0;
  for (const [el, len] of sizes) if (len > bestLen) [best, bestLen] = [el, len];
  if (!best || bestLen < S.PROSE_MIN_LENGTH) return null;

  // Widen to the parent while it only adds sibling paragraphs, not the header or action bar.
  const proseLen = (el: Element) => {
    let total = 0;
    for (const [b, len] of sizes) if (el.contains(b)) total += len;
    return total;
  };
  let el = best;
  while (el.parentElement && el.parentElement !== post) {
    const parent = el.parentElement;
    const hasControls = parent.querySelector(S.ACTION_CANDIDATES + ', ' + S.PROFILE_LINK) !== null;
    const extra = proseLen(parent) - proseLen(el);
    if (hasControls && extra > 0) break;
    if (extra > proseLen(el)) break;
    el = parent;
  }
  return el;
}

/** The post's own text elements (commentary, plus the original post for reshares). */
export function textElements(post: HTMLElement): HTMLElement[] {
  const classic = outermost(post, S.TEXT);
  if (classic.length) return classic;
  const dirLtr = outermost(post, S.TEXT_FALLBACK).filter(
    (el) => !el.closest(S.PROFILE_LINK) && textOf(el).length >= S.TEXT_FALLBACK_MIN_LENGTH,
  );
  if (dirLtr.length) return dirLtr.slice(0, 1);
  const prose = proseBlock(post);
  return prose ? [prose] : [];
}

/* ----------------------------------------------------------------- header */

/** Short text lines before the post text: author name, headline, age, "Following". */
function headerLines(post: HTMLElement, textEl: Element | undefined): string[] {
  const lines: string[] = [];
  for (const el of post.querySelectorAll<HTMLElement>('p, span')) {
    if (textEl && (textEl.contains(el) || !(el.compareDocumentPosition(textEl) & Node.DOCUMENT_POSITION_FOLLOWING))) {
      continue;
    }
    if (el.querySelector('p, span, div') || el.closest('button, [role="button"]') || inComments(el, post)) continue;
    if (el.closest('.visually-hidden')) continue;
    const t = clean(el.textContent);
    if (t.length >= 2 && t.length <= 220 && lines[lines.length - 1] !== t) lines.push(t);
  }
  return lines;
}

function headline(post: HTMLElement, lines: string[]): string {
  const classic = post.querySelector(S.ACTOR_HEADLINE);
  if (classic && !inComments(classic, post)) return textOf(classic);
  const actorLines = [...post.querySelectorAll(S.ACTOR_LINES)].map(textOf).filter(Boolean);
  const pool = actorLines.length ? actorLines : lines;
  return pool.slice(1).find((l) => !S.AGE_TEXT_RE.test(l) && !S.NOT_HEADLINE_RE.test(l)) ?? '';
}

function ageText(post: HTMLElement): string | null {
  const classic = post.querySelector(S.ACTOR_AGE);
  if (classic && !inComments(classic, post)) return clean(classic.textContent);
  const actor = post.querySelector(S.ACTOR);
  for (const scope of [actor, post]) {
    if (!scope) continue;
    for (const el of scope.querySelectorAll(S.AGE_CANDIDATES)) {
      if (inComments(el, post)) continue;
      const t = clean(el.textContent);
      if (t.length <= 40 && S.AGE_TEXT_RE.test(t)) return t;
    }
  }
  return null;
}

/**
 * Names to redact from dataset text: the author and people @mentioned.
 * Returned to the caller only; never stored.
 */
export function personNames(post: HTMLElement): string[] {
  const names = new Set<string>();
  const classic = post.querySelector(S.ACTOR_NAME);
  if (classic) names.add(textOf(classic));
  const textEl = textElements(post)[0];
  const first = headerLines(post, textEl)[0];
  if (first) names.add(first.replace(/\s*•.*$/, ''));
  for (const a of post.querySelectorAll('a[href*="/in/"]')) {
    if (inComments(a, post)) continue;
    const t = clean(a.textContent).replace(/^@/, '');
    if (t.length >= 2 && t.length <= 60) names.add(t);
  }
  return [...names].filter((n) => n.length >= 2);
}

/* ----------------------------------------------------------------- counts */

function count(post: HTMLElement, kind: keyof typeof S.COUNT_PATTERNS): number | null {
  const classic = post.querySelector(S.COUNT_SELECTORS[kind]);
  if (classic && !inComments(classic, post)) {
    const n = parseCount(classic.textContent);
    if (n !== null) return n;
  }
  for (const el of post.querySelectorAll(S.COUNT_CANDIDATES)) {
    if (inComments(el, post)) continue;
    const aria = clean(el.getAttribute('aria-label'));
    const text = clean(el.textContent);
    for (const label of [aria, text]) {
      if (!label || label.length > S.COUNT_MAX_TEXT_LENGTH) continue;
      for (const { re, add } of S.COUNT_PATTERNS[kind]) {
        const n = parseCount(label.match(re)?.[1]);
        if (n !== null) return n + add;
      }
    }
    // SDUI: <button aria-label="Comment"><svg/>17</button>
    if (aria && S.COUNT_KIND_WORDS[kind].test(aria) && S.BARE_NUMBER_RE.test(text)) return parseCount(text);
  }
  return null;
}

/* ------------------------------------------------------------------ links */

function links(post: HTMLElement): LinkInfo[] {
  const out: LinkInfo[] = [];
  for (const a of post.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (inComments(a, post)) continue;
    const href = a.getAttribute('href') ?? '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    out.push({ href, text: clean(a.textContent) });
  }
  for (const sub of post.querySelectorAll(S.CARD_SUBTITLE)) {
    if (inComments(sub, post)) continue;
    const domain = clean(sub.textContent).split(/[\s•·|]+/)[0] ?? '';
    if (domain.includes('.')) out.push({ href: '', text: domain });
  }
  return out;
}

/* ------------------------------------------------------------------- main */

export function extractPost(post: HTMLElement): PostData | null {
  const textEls = textElements(post);
  const text = textEls.map(textOf).filter(Boolean).join('\n\n');
  if (!text) return null;
  const age = ageText(post);
  const shortAge = age?.match(S.SHORT_AGE_RE)?.[0] ?? age;
  const postLinks = links(post);
  const emails = new Set<string>((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()));
  for (const l of postLinks) {
    if (l.href.toLowerCase().startsWith('mailto:')) emails.add(l.href.slice(7).split('?')[0]!.toLowerCase());
  }
  return {
    id: activityId(post) ?? `text:${hashText(text.slice(0, 300))}`,
    text,
    authorHeadline: headline(post, headerLines(post, textEls[0])),
    ageText: shortAge,
    ageHours: parseAgeHours(age),
    reactions: count(post, 'reactions'),
    comments: count(post, 'comments'),
    reposts: count(post, 'reposts'),
    links: postLinks,
    emails: [...emails],
  };
}

/**
 * Where the badge goes: just above the post text, as a sibling block. Posts
 * are labelled before they scroll into view, so this never moves what the
 * reader is looking at. Falls back to the top of the post.
 */
export function badgeSlot(post: HTMLElement): { parent: Element; before: Element | null } {
  const textEl = textElements(post)[0];
  if (textEl) {
    if (textEl.tagName === 'DIV' && textEl.parentElement) return { parent: textEl.parentElement, before: textEl };
    const div = textEl.parentElement?.closest('div');
    if (div && post.contains(div)) {
      let child: Element = textEl;
      while (child.parentElement && child.parentElement !== div) child = child.parentElement;
      return { parent: div, before: child };
    }
  }
  return { parent: post, before: post.firstElementChild };
}

/** Structure summary for debug logs when no posts are found. No post text or names. */
export function diagnose(doc: Document): Record<string, unknown> {
  const scope = doc.querySelector(S.FEED_ROOT) ?? doc.body;
  const labels = new Map<string, number>();
  for (const el of scope.querySelectorAll(S.ACTION_CANDIDATES)) {
    const l = labelOf(el).replace(/\b(by|for|of)\b.*$/i, '$1 …').slice(0, 40);
    if (l) labels.set(l, (labels.get(l) ?? 0) + 1);
  }
  const attrs = (name: string) => {
    const m = new Map<string, number>();
    for (const el of scope.querySelectorAll(`[${name}]`)) {
      const v = (el.getAttribute(name) ?? '').replace(/[0-9a-f-]{16,}|\d{6,}/gi, '#').slice(0, 40);
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).slice(0, 15));
  };
  return {
    url: location.pathname,
    hasMain: !!doc.querySelector(S.FEED_ROOT),
    postsBySelector: doc.querySelectorAll(S.POST).length,
    postsByActionBar: postsByActionBar(doc).length,
    buttonLabels: Object.fromEntries([...labels].sort((a, b) => b[1] - a[1]).slice(0, 25)),
    dataTestIds: attrs('data-testid'),
    dataViewNames: attrs('data-view-name'),
    componentKeys: attrs('componentkey'),
  };
}
