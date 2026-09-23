// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { badgeSlot, diagnose, extractPost, findPosts, personNames } from '../src/content/extract';
import { classifyRules } from '../src/pipeline';
import type { Label, PostData } from '../src/types';

const DIR = join(__dirname, '..', 'fixtures', 'posts');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();

/** Posts per fixture file. */
const POSTS_IN: Record<string, number> = { '06-sdui-feed.html': 2 };

function loadAll(file: string): HTMLElement[] {
  document.body.innerHTML = readFileSync(join(DIR, file), 'utf8');
  const posts = findPosts(document);
  expect(posts).toHaveLength(POSTS_IN[file] ?? 1);
  return posts;
}

function load(file: string, index = 0): HTMLElement {
  return loadAll(file)[index]!;
}

function extract(file: string, index = 0): PostData {
  const data = extractPost(load(file, index));
  expect(data).not.toBeNull();
  return data!;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findPosts', () => {
  it('finds one outermost container per post across both layouts', () => {
    document.body.innerHTML = FILES.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
    const total = FILES.reduce((n, f) => n + (POSTS_IN[f] ?? 1), 0);
    expect(findPosts(document)).toHaveLength(total);
  });
});

describe('01 classic post with ATS link card', () => {
  const file = '01-classic-ats-card.html';

  it('reads id, headline, age and counts', () => {
    const d = extract(file);
    expect(d.id).toBe('urn:li:activity:7310000000000000001');
    expect(d.authorHeadline).toBe('Engineering Manager at Acme Robotics | ex-Globex');
    expect(d.ageText).toBe('5h');
    expect(d.ageHours).toBe(5);
    expect(d).toMatchObject({ reactions: 48, comments: 12, reposts: 3 });
  });

  it('reads the full text without screen-reader duplicates or the "more" button', () => {
    const d = extract(file);
    expect(d.text).toContain("We're hiring at Acme Robotics!");
    expect(d.text).toContain('Location: Bengaluru (Hybrid)');
    expect(d.text).toContain('#hiring');
    expect(d.text).not.toContain('hashtag');
    expect(d.text).not.toContain('…more');
    expect(d.text.split('\n').length).toBeGreaterThan(4);
  });

  it('collects links and the card domain, but nothing from comments', () => {
    const d = extract(file);
    expect(d.links.map((l) => l.href)).toContain('https://lnkd.in/gQx7Abc');
    expect(d.links.map((l) => l.text)).toContain('job-boards.greenhouse.io');
    expect(JSON.stringify(d)).not.toContain('wa.me');
    expect(d.text).not.toContain('Interested!');
  });
});

describe('02 classic bait post (data-id only)', () => {
  it('reads the post', () => {
    const d = extract('02-classic-bait.html');
    expect(d.id).toBe('urn:li:activity:7310000000000000002');
    expect(d.ageHours).toBe(48);
    expect(d.ageText).toBe('2d');
    expect(d).toMatchObject({ reactions: 2311, comments: 1204, reposts: 187 });
    expect(d.text).toContain('Comment "Interested"');
  });
});

describe('03 classic post with a social header', () => {
  it('takes the headline from the author, not the person who liked it', () => {
    const d = extract('03-classic-new-position.html');
    expect(d.authorHeadline).toBe('Data Analyst at Initech');
    expect(d.ageHours).toBe(168);
    expect(d.reactions).toBe(212); // "Alex Kim and 211 others"
    expect(d.comments).toBe(64);
    expect(d.reposts).toBeNull();
  });
});

describe('04 hashed-class layout', () => {
  it('reads id from componentkey and actor lines', () => {
    const d = extract('04-hashed-scam.html');
    expect(d.id).toBe('urn:li:activity:7310000000000000004');
    expect(d.authorHeadline).toBe('HR Manager | Global Placements');
    expect(d.ageText).toBe('2d');
    expect(d.ageHours).toBe(48);
    expect(d).toMatchObject({ reactions: 3511, comments: 1204, reposts: 87 });
  });

  it('finds the text without class names', () => {
    const d = extract('04-hashed-scam.html');
    expect(d.text).toContain('Earn ₹3,000 per day!');
    expect(d.text).not.toContain('Sam Taylor');
    expect(d.text).not.toContain('HR Manager');
    expect(d.text).not.toMatch(/more$/);
    expect(d.links.map((l) => l.href)).toContain('https://wa.me/919876500000');
  });
});

describe('05 hashed layout without any URN', () => {
  it('falls back to a text hash id and reads mailto emails', () => {
    const d = extract('05-hashed-corporate-email.html');
    expect(d.id).toMatch(/^text:[0-9a-z]+$/);
    expect(extract('05-hashed-corporate-email.html').id).toBe(d.id); // stable
    expect(d.authorHeadline).toBe('Design Lead at Globex');
    expect(d.ageHours).toBe(168);
    expect(d.reactions).toBe(42);
    expect(d.comments).toBe(18);
    expect(d.emails).toEqual(['careers@globex.in']);
  });

  it('ignores the comment thread', () => {
    const d = extract('05-hashed-corporate-email.html');
    expect(JSON.stringify(d)).not.toContain('t.me');
  });
});

describe('06 SDUI redesign (no data attributes, icon-only action bar)', () => {
  const file = '06-sdui-feed.html';

  it('finds exactly the two posts, not the "Sort by" item', () => {
    const posts = loadAll(file);
    // The list item: the largest element holding exactly one action bar.
    expect(posts.map((p) => p.getAttribute('componentkey'))).toEqual([
      'auto-component-1f0c2a9e-0000-4000-8000-000000000002',
      'auto-component-1f0c2a9e-0000-4000-8000-000000000003',
    ]);
    expect(posts.every((p) => !p.textContent!.includes('Sort by'))).toBe(true);
  });

  it('reads text, headline, age and icon-only counts', () => {
    const d = extract(file, 0);
    expect(d.text).toContain('Hiring: Indian Cuisine Cook');
    expect(d.text).toContain('WhatsApp us');
    expect(d.text).not.toContain('Robin Example');
    expect(d.text).not.toContain('more');
    expect(d.authorHeadline).toBe('Founder of Northwind Visas, leading personalized immigration guidance');
    expect(d.ageText).toBe('1w');
    expect(d.reactions).toBe(66);
    expect(d.comments).toBe(17);
    expect(d.id).toMatch(/^text:/);
  });

  it('reads the promoted post separately', () => {
    const d = extract(file, 1);
    expect(d.text).toContain('BIM career to Japan');
    expect(d.text).not.toContain('Indian Cuisine');
    expect(d.reactions).toBe(12);
    expect(d.comments).toBeNull();
    expect(d.authorHeadline).toBe(''); // "1,331 followers" and "Promoted" are not a headline
  });

  it('knows the author name for redaction', () => {
    expect(personNames(load(file, 0))).toContain('Robin Example');
  });

  it('diagnose() summarises structure without post text', () => {
    loadAll(file);
    const report = JSON.stringify(diagnose(document));
    expect(report).toContain('postsByActionBar');
    expect(report).not.toContain('Indian Cuisine');
    expect(report).not.toContain('Robin');
  });
});

describe('end to end: fixture -> label (rules only)', () => {
  const expected: Record<string, Label | Label[]> = {
    '01-classic-ats-card.html': 'apply_early',
    '02-classic-bait.html': 'engagement_bait',
    '03-classic-new-position.html': 'not_hiring',
    '04-hashed-scam.html': 'scam_risk',
    '05-hashed-corporate-email.html': 'real_opening',
    '06-sdui-feed.html': ['scam_risk', 'not_hiring'],
  };

  it('covers every fixture', () => expect(Object.keys(expected).sort()).toEqual(FILES));

  it.each(Object.entries(expected))('%s -> %s', (file, labels) => {
    [labels].flat().forEach((label, i) => {
      const r = classifyRules(extract(file, i));
      expect(r.decision.label).toBe(label);
      expect(r.decision.reasons.length).toBeGreaterThan(0);
    });
  });

  it('01 reason line names Greenhouse and the poster', () => {
    const r = classifyRules(extract('01-classic-ats-card.html'));
    expect(r.decision.reasons[0]).toBe('Apply link on Greenhouse');
    expect(r.features.posterAtCompany).toBe(true);
  });
});

describe('badgeSlot', () => {
  it.each(FILES)('%s: puts the badge right before the post text, inside the post', (file) => {
    const post = load(file);
    const textStart = extractPost(post)!.text.slice(0, 12);
    const { parent, before } = badgeSlot(post);
    expect(post.contains(parent)).toBe(true);
    const marker = document.createElement('i');
    parent.insertBefore(marker, before);
    // The badge comes after the author block and before the body text.
    const all = post.innerHTML;
    expect(all.indexOf('<i>')).toBeGreaterThan(-1);
    expect(marker.closest('a')).toBeNull(); // never inside a link
    expect(marker.closest('button')).toBeNull();
    expect(marker.closest('p')).toBeNull();
    // The next text after the marker is the post text.
    const range = document.createRange();
    range.setStartAfter(marker);
    range.setEnd(post, post.childNodes.length);
    expect(range.toString().replace(/\s+/g, ' ').trim().startsWith(textStart.replace(/\s+/g, ' ').trim())).toBe(true);
  });
});
