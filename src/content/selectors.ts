/**
 * Every LinkedIn DOM selector lives here. LinkedIn serves two layouts:
 *
 *  - Classic: semantic class names (`feed-shared-update-v2`, `update-components-*`)
 *    and `data-urn="urn:li:activity:..."`. Still live as of 2026.
 *  - Hashed: every class name is a random token. Posts are still marked with
 *    `data-view-name="feed-full-update"` or a `componentkey` containing
 *    "FeedType"; the actor block is `a[data-view-name="feed-actor-image"] + a`
 *    holding `<p>` lines; links in the text carry `data-view-name="feed-commentary"`.
 *
 *  - SDUI (2026 redesign): hashed classes, `componentkey` UUIDs, almost no data
 *    attributes on posts. Posts are found structurally instead: each post has
 *    exactly one action bar (Like / Comment / Repost / Send), so the post is
 *    the largest element that contains exactly one action bar. See findPosts().
 *
 * Order within each list = preference. Prefer data attributes and aria labels
 * over class names; class names are last-resort fallbacks.
 *
 * When LinkedIn changes something: turn on Debug mode in the popup, inspect
 * the logged PostData, fix the selector here and add a fixture in
 * fixtures/posts/.
 */

/** A post container. Nested matches are collapsed to the outermost one. */
export const POST = [
  '[data-urn^="urn:li:activity:"]',
  '[data-id^="urn:li:activity:"]',
  'div[data-view-name="feed-full-update"]',
  'div[componentkey*="FeedType"]',
  'div.feed-shared-update-v2',
].join(',');

/** The feed column. Post containers never grow past these. */
export const FEED_BOUNDARY = 'main, [role="main"], [data-testid="lazy-column"], [data-sdui-screen], body';
/** Where to search for action-bar buttons (keeps the messaging overlay out). */
export const FEED_ROOT = 'main, [role="main"]';

/** Clickable things that may be action-bar buttons. */
export const ACTION_CANDIDATES = 'button, [role="button"], a[role="button"]';
/**
 * Action-bar button labels (aria-label, else visible text). Each post has one
 * of each; the kind that finds the most posts wins. Counts ("12 comments")
 * start with a digit and never match.
 */
export const ACTION_KINDS: Record<string, RegExp> = {
  send: /^send(?: in a private message)?$/i,
  repost: /^repost$/i,
  like: /^(?:like|react like|reaction button state.*)$/i,
  comment: /^comment$/i,
};

/** Where to look for an `urn:li:activity:<id>` inside a post (attribute values). */
export const ACTIVITY_ID_ATTRS = ['data-urn', 'data-id', 'componentkey', 'href'];
export const ACTIVITY_ID_CARRIERS = [
  '[data-urn*="urn:li:activity:"]',
  '[data-id*="urn:li:activity:"]',
  '[componentkey*="urn:li:activity:"]',
  'a[href*="urn:li:activity:"]',
].join(',');
export const ACTIVITY_ID_RE = /urn:li:activity:(\d+)/;

/** The author's link block (name, headline, age). */
export const ACTOR = [
  '.update-components-actor__meta',
  'a[data-view-name="feed-actor-image"] + a',
].join(',');

/** Author headline. Used only for company matching; never stored. */
export const ACTOR_HEADLINE = '.update-components-actor__description';
/** In the hashed layout the actor link holds <p> lines: name, headline, age. */
export const ACTOR_LINES = 'a[data-view-name="feed-actor-image"] + a p';

/** Relative age ("5h • Edited"). */
export const ACTOR_AGE = '.update-components-actor__sub-description';
/** Classic author name (read only to redact it from dataset text). */
export const ACTOR_NAME = '.update-components-actor__title';
/** Header lines that are not the author's headline. */
export const NOT_HEADLINE_RE = /^(?:•\s*)?(?:following|follow|promoted|sponsored|verified|\d+(?:st|nd|rd|th)\+?|•.*|\d[\d,.]*\s*followers?)$/i;

/** Short elements that may hold the age when the class above is missing. */
export const AGE_CANDIDATES = 'p, span';
export const AGE_TEXT_RE = /^\s*(?:\d+\s*(?:mo|m|h|d|w|yr|y)\b|just now|now\b)/i;
/** The short form kept as ageText ("5h"), not the screen-reader sentence. */
export const SHORT_AGE_RE = /\d+\s*(?:mo|m|h|d|w|yr|y)\b|just now/i;

/**
 * Post text containers, preferred first. The full text is already in the DOM
 * even when "…more" is showing (LinkedIn clips it with CSS), so we never click.
 */
export const TEXT = [
  '[data-testid="expandable-text-box"]',
  '.feed-shared-update-v2__description',
  '.feed-shared-inline-show-more-text',
  '.update-components-text',
  '.feed-shared-text',
].join(',');
/** Fallback text candidates in the hashed layout. */
export const TEXT_FALLBACK = '[dir="ltr"]';
export const TEXT_FALLBACK_MIN_LENGTH = 20;

/**
 * Last resort for text: the element holding the most prose, found by walking
 * text nodes. Anything inside these is never post text.
 */
export const NOT_TEXT = 'button, [role="button"], svg, img, video, a[href*="/in/"], a[href*="/company/"], [aria-hidden="true"]';
export const PROSE_MIN_LENGTH = 25;

/** Removed from a copy of the text before reading it. */
export const TEXT_STRIP = [
  '.visually-hidden',
  'button',
  '[role="button"]',
  '.feed-shared-inline-show-more-text__see-more-less-toggle',
].join(',');

/** Link-preview cards: the subtitle usually shows the real destination domain. */
export const CARD_SUBTITLE = [
  '.update-components-article__subtitle',
  '.feed-shared-article__subtitle',
  '.update-components-article-first-party__subtitle',
].join(',');

/** Profile / company links: the actor block and @mentions. Excluded from text fallbacks. */
export const PROFILE_LINK = 'a[href*="/in/"], a[href*="/company/"], a[data-view-name="feed-actor-image"]';

/** Comment threads under a post. Nothing inside is read. */
export const COMMENTS = [
  '.comments-comments-list',
  '.feed-shared-update-v2__comments-container',
  '.comments-comment-entity',
  '.comments-comment-item',
  'article[data-id^="urn:li:comment:"]',
  '[data-view-name^="comment"]',
  '[data-view-name*="comment-list"]',
].join(',');

/** Social counts. Classic class names first, then aria-label / text patterns. */
export const COUNT_SELECTORS = {
  reactions: '.social-details-social-counts__reactions-count',
  comments: '.social-details-social-counts__comments',
  reposts: '.social-details-social-counts__item--right-aligned',
} as const;

export const COUNT_CANDIDATES = 'button, a, span, li, p';
const N = String.raw`(\d[\d,.]*\s*[KkMm]?)`;
/** `add` covers "Priya and 47 others" (= 48 reactions). */
export const COUNT_PATTERNS: Record<'reactions' | 'comments' | 'reposts', { re: RegExp; add: number }[]> = {
  reactions: [
    { re: new RegExp(String.raw`^${N}\s+reactions?\b`, 'i'), add: 0 },
    { re: new RegExp(String.raw`\band\s+${N}\s+others?\b`, 'i'), add: 1 },
  ],
  comments: [{ re: new RegExp(String.raw`^${N}\s+comments?\b`, 'i'), add: 0 }],
  reposts: [{ re: new RegExp(String.raw`^${N}\s+(?:reposts?|shares?)\b`, 'i'), add: 0 }],
};
/** Buttons whose aria-label names the kind and whose text is a bare number ("66"). */
export const COUNT_KIND_WORDS: Record<'reactions' | 'comments' | 'reposts', RegExp> = {
  reactions: /\b(?:reactions?|likes?|react)\b/i,
  comments: /\bcomments?\b/i,
  reposts: /\b(?:reposts?|shares?)\b/i,
};
export const BARE_NUMBER_RE = /^\d[\d,.]*\s*[KkMm]?$/;
/** Count labels are short; longer text is post or comment content. */
export const COUNT_MAX_TEXT_LENGTH = 60;
