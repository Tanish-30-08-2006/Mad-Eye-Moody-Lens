/**
 * tests/unit/selectors.test.ts – Unit tests verifying Reddit selector definitions.
 *
 * Checks that constants and selectors match constraints specified in PLAN.md.
 */

import { describe, it, expect } from 'vitest';
import {
  POST_TAG,
  POST_SELECTOR,
  FEED_SELECTOR,
  ATTR_POST_TYPE,
  ATTR_CONTENT_HREF,
  ATTR_PERMALINK,
  ATTR_POST_ID,
  ATTR_POST_TITLE,
  PROCESSED_MARKER,
} from '../../src/adapters/reddit/selectors';

describe('Reddit Selectors & Attributes Specification', () => {
  it('uses shreddit-post rather than legacy tags', () => {
    expect(POST_TAG).toBe('shreddit-post');
    expect(POST_SELECTOR).toBe('shreddit-post');
  });

  it('declares the expected container feed selector', () => {
    expect(FEED_SELECTOR).toBe('shreddit-feed');
  });

  it('defines verified attribute constants', () => {
    expect(ATTR_POST_TYPE).toBe('post-type');
    expect(ATTR_CONTENT_HREF).toBe('content-href');
    expect(ATTR_PERMALINK).toBe('permalink');
    expect(ATTR_POST_ID).toBe('id');
    expect(ATTR_POST_TITLE).toBe('post-title');
  });

  it('defines the deduplication marker', () => {
    expect(PROCESSED_MARKER).toBe('data-moody-lens');
  });
});
