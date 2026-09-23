import { describe, expect, it } from 'vitest';
import { anonymize } from '../src/rules/anonymize';

describe('anonymize', () => {
  it('removes author and mentioned names, including first names alone', () => {
    const out = anonymize('Priya Sharma here. Ping Priya or Rahul Verma for details.', ['Priya Sharma', 'Rahul Verma']);
    expect(out).toBe('[name] here. Ping [name] or [name] for details.');
  });

  it('does not touch words that merely contain a name', () => {
    expect(anonymize('Anand is hiring at Anandam Labs', ['Anand'])).toBe('[name] is hiring at Anandam Labs');
  });

  it('removes profile URLs', () => {
    expect(anonymize('See https://www.linkedin.com/in/priya-s-123/ and in.linkedin.com/in/abc', [])).toBe(
      'See [profile] and [profile]',
    );
  });

  it('keeps only the email domain type', () => {
    expect(anonymize('Mail hr@acme.com or acme.jobs@gmail.com', [])).toBe('Mail [email:company] or [email:free]');
  });

  it('removes phone numbers but not years or salaries', () => {
    expect(anonymize('Call +91 98765 43210. 2024 batch, CTC 12 LPA', [])).toBe('Call [phone]. 2024 batch, CTC 12 LPA');
  });
});
