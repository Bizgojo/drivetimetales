/**
 * HUMAN-STORIES-001 (canon item 150, Marc Nov 13, 2026, after listening to "Long Haul"):
 * "the stories are too technical. They often talk about AI ... they should be non-technical
 * stories that deal with human interactions with humans." Sci-fi stories are exempt (Marc:
 * "except for sci-fi stories"). Writer and planner guidance only; no new script check
 * (item 149's rule freeze).
 */
export function isSciFiGenre(genre: unknown): boolean {
  return /\b(sci[\s-]?fi|science fiction)\b/i.test(String(genre || ''))
}

export function humanStoriesBlock(genre: unknown): string {
  if (isSciFiGenre(genre)) return ''
  return `PEOPLE, NOT TECHNOLOGY (HUMAN-STORIES-001, Marc):
- This story is about people dealing with people: family, love, betrayal, money, secrets, loyalty, danger.
- No AI, robots, androids, algorithms, self-driving or "autonomous" vehicles, hacking, or technical explanations as part of the story.
- Everyday things (a phone call, a text, a voicemail, a security camera) may appear as simple props. Never explain how they work, and never let one solve the problem: people do.`
}
