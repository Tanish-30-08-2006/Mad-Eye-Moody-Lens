/**
 * adapters/reddit/disclosure.ts – Detects when an author labelled their own post as AI-made.
 *
 * Titles and flair are read locally to set a boolean; the text itself is never stored or logged.
 */

import { ATTR_POST_TITLE, FLAIR_SELECTOR, POST_SELECTOR } from './selectors';

// Tags like "[AI]", "(AI)", "[AI art]", "AI generated", "#aiart" in a title.
const TITLE_PATTERN = /\[\s*(?:ai|a\.i\.)(?:[\s-]*(?:generated|art|image|video|made|assisted))?\s*\]|\(\s*ai\s*\)|\bai[\s-]*generated\b|#ai(?:art|generated)?\b/i;
// Flair is short, so a bare "AI" word is enough.
const FLAIR_PATTERN = /\bai\b|\ba\.i\.|ai[\s-]*(?:generated|art|image|video)/i;
const AUTHOR_TAG = /^\s*(?:\[(?:AI(?:[- ](?:generated|assisted|art|image|video|made))?|satire)\]|\((?:AI|satire)\))(?=\s|$)/i;

export function authorTitleDisclosure(title?: string): string | undefined {
  return title?.match(AUTHOR_TAG)?.[0].trim();
}

export function isDisclosedAi(title: string | null | undefined, flair: string | null | undefined): boolean {
  return (!!title && TITLE_PATTERN.test(title)) || (!!flair && FLAIR_PATTERN.test(flair));
}

/** Reads the title attribute and flair element of a post. */
export function readFlair(post: Element): string | undefined {
  return Array.from(post.querySelectorAll(FLAIR_SELECTOR))
    .find((flair) => flair.closest(POST_SELECTOR) === post)?.textContent?.trim().slice(0, 300) || undefined;
}

export function readDisclosure(post: Element): boolean {
  // Flair can belong to a moderator or automation. Never represent it as the author's statement.
  const tag = authorTitleDisclosure(post.getAttribute(ATTR_POST_TITLE) ?? undefined);
  return !!tag && FLAIR_PATTERN.test(tag);
}
