import type { PostData } from '../src/types';

export function post(text: string, overrides: Partial<PostData> = {}): PostData {
  return {
    id: 'urn:li:activity:1',
    text,
    authorHeadline: '',
    ageText: '5h',
    ageHours: 5,
    reactions: 10,
    comments: 12,
    reposts: 0,
    links: [],
    emails: [],
    ...overrides,
  };
}

export function link(href: string, text = href) {
  return { href, text };
}
