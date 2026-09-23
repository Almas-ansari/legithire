// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BADGE_ATTR, createBadge } from '../src/content/badge';

describe('createBadge', () => {
  it('marks the host with the label and keeps LinkedIn out of its shadow root', () => {
    const host = createBadge({ label: 'apply_early', reasons: ['Apply link on Lever', 'posted 5h ago'] });
    expect(host.getAttribute(BADGE_ATTR)).toBe('apply_early');
    expect(host.shadowRoot).toBeNull(); // closed shadow root
    expect(host.textContent).toBe(''); // nothing in the light DOM for LinkedIn styles to touch
  });
});
