/**
 * adapters/reddit/disclosure.ts – Detects when an author labelled their own post as AI-made.
 *
 * Titles and flair are read locally to set a boolean; the text itself is never stored or logged.
 */

import { ATTR_POST_TITLE, FLAIR_SELECTOR } from './selectors';

// Tags like "[AI]", "(AI)", "[AI art]", "AI generated", "#aiart" in a title.
const TITLE_PATTERN = /\[\s*(?:ai|a\.i\.)(?:[\s-]*(?:generated|art|image|video|made|assisted))?\s*\]|\(\s*ai\s*\)|\bai[\s-]*generated\b|#ai(?:art|generated)?\b/i;
// Flair is short, so a bare "AI" word is enough.
const FLAIR_PATTERN = /\bai\b|\ba\.i\.|ai[\s-]*(?:generated|art|image|video)/i;

export function isDisclosedAi(title: string | null | undefined, flair: string | null | undefined): boolean {
  return (!!title && TITLE_PATTERN.test(title)) || (!!flair && FLAIR_PATTERN.test(flair));
}

/** Reads the title attribute and flair element of a post. */
export function readDisclosure(post: Element): boolean {
  let flair: string | null = null;
  try {
    flair = post.querySelector(FLAIR_SELECTOR)?.textContent ?? null;
  } catch {
    flair = null;
  }
  return isDisclosedAi(post.getAttribute(ATTR_POST_TITLE), flair);
}
