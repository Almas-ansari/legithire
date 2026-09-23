/**
 * Lowercase, turn every run of non-letter/digit characters (except "+") into a
 * single space, and pad with spaces so whole-word matching is a substring test.
 */
export function flatten(text: string): string {
  const body = text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .trim();
  return ` ${body} `;
}

/** Phrases from `list` that appear as whole words in `flatText` (output of flatten). */
export function findPhrases(flatText: string, list: readonly string[]): string[] {
  const hits: string[] = [];
  for (const phrase of list) {
    const needle = flatten(phrase);
    if (needle.trim() && flatText.includes(needle)) hits.push(phrase);
  }
  return hits;
}

/** Tokens of flattened text, for joining adjacent words ("Acme Corp" -> "acmecorp"). */
export function tokens(flatText: string): string[] {
  return flatText.trim().split(' ').filter(Boolean);
}

/** True if `label` equals any single token or 2-3 adjacent tokens joined together. */
export function labelInTokens(label: string, toks: string[]): boolean {
  const l = label.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (l.length < 3) return false;
  for (let i = 0; i < toks.length; i++) {
    let joined = '';
    for (let j = i; j < Math.min(i + 3, toks.length); j++) {
      joined += toks[j];
      if (joined === l) return true;
      if (joined.length >= l.length) break;
    }
  }
  return false;
}
