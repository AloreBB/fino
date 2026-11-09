/** Accent- and case-insensitive matching for voice search. */
export function normalize(text: string): string {
  return text
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every query token appears (as a substring) in the target. */
export function matchesQuery(target: string, query: string): boolean {
  const t = normalize(target);
  const tokens = normalize(query).split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
}
