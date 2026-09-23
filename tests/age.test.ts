import { describe, expect, it } from 'vitest';
import { formatAge, parseAgeHours, parseCount } from '../src/rules/age';

describe('parseAgeHours', () => {
  it.each([
    ['5h', 5],
    ['5h •', 5],
    ['2d', 48],
    ['1w', 168],
    ['3mo', 3 * 720],
    ['1yr', 8760],
    ['30m', 0.5],
    ['45s', 45 / 3600],
    ['5 hours ago • Edited', 5],
    ['1 hour ago', 1],
    ['2 days ago', 48],
    ['3 weeks ago', 504],
    ['2 months ago', 1440],
    ['10 minutes ago', 10 / 60],
    ['1 year ago', 8760],
    ['Just now', 0],
    ['now', 0],
    ['2d • Edited • Visible to anyone on or off LinkedIn', 48],
  ])('%s -> %d', (raw, hours) => {
    expect(parseAgeHours(raw)).toBeCloseTo(hours, 6);
  });

  it.each([null, undefined, '', 'Promoted', 'Edited'])('%s -> null', (raw) => {
    expect(parseAgeHours(raw)).toBeNull();
  });

  it('does not confuse months with minutes', () => {
    expect(parseAgeHours('3mo')).toBe(3 * 720);
    expect(parseAgeHours('3m')).toBe(3 / 60);
  });
});

describe('formatAge', () => {
  it.each([
    [0, 'just now'],
    [0.5, '30m'],
    [5, '5h'],
    [48, '2d'],
    [336, '2w'],
    [1440, '2mo'],
    [9000, '1y'],
  ])('%d -> %s', (h, s) => expect(formatAge(h)).toBe(s));
});

describe('parseCount', () => {
  it.each([
    ['12', 12],
    ['1,234', 1234],
    ['1.2K', 1200],
    ['3M', 3_000_000],
    ['12 comments', 12],
    ['1 repost', 1],
  ])('%s -> %d', (raw, n) => expect(parseCount(raw)).toBe(n));

  it('returns null when absent', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount(null)).toBeNull();
    expect(parseCount('comments')).toBeNull();
  });
});
