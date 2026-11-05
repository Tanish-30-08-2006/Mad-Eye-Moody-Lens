// @vitest-environment happy-dom
/**
 * tests/unit/extractors.test.ts – Image/gallery/video extractors against SYNTHETIC posts.
 * Inner markup is invented (not recorded from Reddit). Label: RUNTIME (DOM simulation).
 */
import { describe, it, expect } from 'vitest';
import { extractImage } from '../../src/adapters/reddit/extract-image';
import { extractGallery } from '../../src/adapters/reddit/extract-gallery';
import { extractVideo } from '../../src/adapters/reddit/extract-video';
import { redditAdapter } from '../../src/adapters/reddit';
import { makePost } from '../helpers/synthetic-posts';

describe('extractImage', () => {
  it('uses content-href when allowlisted', () => {
    const ref = extractImage(makePost({ type: 'image', contentHref: 'https://i.redd.it/abc.jpeg' }));
    expect(ref).toMatchObject({ kind: 'image', urls: ['https://i.redd.it/abc.jpeg'], postId: 't3_abc' });
    expect(ref?.permalink).toContain('/r/test/comments/');
  });

  it('falls back to the widest srcset entry of an <img>, keeping the signed query intact', () => {
    const ref = extractImage(
      makePost({
        type: 'image',
        contentHref: 'https://example.com/not-reddit.jpg',
        inner:
          '<img srcset="https://preview.redd.it/x.jpg?width=320&s=aa 320w, https://preview.redd.it/x.jpg?width=960&s=bb 960w">',
      }),
    );
    expect(ref?.urls).toEqual(['https://preview.redd.it/x.jpg?width=960&s=bb']);
  });

  it('reads lazy-loaded attributes', () => {
    const ref = extractImage(
      makePost({ type: 'image', inner: '<img data-lazy-src="https://i.redd.it/lazy.png">' }),
    );
    expect(ref?.urls).toEqual(['https://i.redd.it/lazy.png']);
  });

  it('skips avatars and tiny icons', () => {
    const ref = extractImage(
      makePost({
        type: 'image',
        inner:
          '<img src="https://i.redd.it/snoovatar/avatars/a.png"><img src="https://i.redd.it/small.png" width="24" height="24">',
      }),
    );
    expect(ref).toBeNull();
  });

  it('rejects non-allowlisted hosts and non-https URLs', () => {
    expect(extractImage(makePost({ type: 'image', contentHref: 'https://evil.com/a.jpg' }))).toBeNull();
    expect(extractImage(makePost({ type: 'image', contentHref: 'http://i.redd.it/a.jpg' }))).toBeNull();
    expect(
      extractImage(makePost({ type: 'image', inner: '<img src="https://i.redd.it.evil.com/a.jpg">' })),
    ).toBeNull();
  });

  it('returns null without identity attributes', () => {
    const post = makePost({ type: 'image', contentHref: 'https://i.redd.it/a.jpg' });
    post.removeAttribute('permalink');
    expect(extractImage(post)).toBeNull();
  });
});

describe('extractGallery', () => {
  it('collects every slide image, de-duplicated', () => {
    const ref = extractGallery(
      makePost({
        type: 'gallery',
        inner:
          '<gallery-carousel><img src="https://preview.redd.it/1.jpg"><img src="https://preview.redd.it/2.jpg"><img src="https://preview.redd.it/1.jpg"></gallery-carousel>',
      }),
    );
    expect(ref?.kind).toBe('gallery');
    expect(ref?.urls).toEqual(['https://preview.redd.it/1.jpg', 'https://preview.redd.it/2.jpg']);
  });

  it('falls back to all post images when no carousel element exists', () => {
    const ref = extractGallery(makePost({ type: 'gallery', inner: '<img src="https://i.redd.it/g.jpg">' }));
    expect(ref?.urls).toEqual(['https://i.redd.it/g.jpg']);
  });

  it('returns null with no valid images', () => {
    expect(extractGallery(makePost({ type: 'gallery', inner: '<img src="https://evil.com/x.jpg">' }))).toBeNull();
  });
});

describe('extractVideo', () => {
  it('reads video and audio from a packaged-media style JSON attribute', () => {
    const json = JSON.stringify({
      playbackMp4s: {
        permutations: [
          { source: { url: 'https://v.redd.it/vid/DASH_720.mp4' } },
          { source: { url: 'https://v.redd.it/vid/DASH_480.mp4' } },
        ],
      },
      audio: 'https://v.redd.it/vid/DASH_audio.mp4',
    });
    const ref = extractVideo(
      makePost({
        type: 'video',
        inner: `<shreddit-player packaged-media-json='${json}' src="https://v.redd.it/vid/HLSPlaylist.m3u8"></shreddit-player>`,
      }),
    );
    expect(ref?.kind).toBe('video');
    expect(ref?.urls).toEqual([
      'https://v.redd.it/vid/HLSPlaylist.m3u8',
      'https://v.redd.it/vid/DASH_720.mp4',
      'https://v.redd.it/vid/DASH_480.mp4',
    ]);
    expect(ref?.audioUrl).toBe('https://v.redd.it/vid/DASH_audio.mp4');
  });

  it('treats a silent video as valid with audioUrl undefined', () => {
    const ref = extractVideo(
      makePost({ type: 'video', inner: '<video src="https://v.redd.it/s/CMAF_360.mp4"></video>' }),
    );
    expect(ref?.urls).toEqual(['https://v.redd.it/s/CMAF_360.mp4']);
    expect(ref?.audioUrl).toBeUndefined();
  });

  it('reads <source> children and ignores blob: URLs', () => {
    const ref = extractVideo(
      makePost({
        type: 'video',
        inner: '<video src="blob:https://www.reddit.com/abc"><source src="https://v.redd.it/z/DASH_480.mp4"></video>',
      }),
    );
    expect(ref?.urls).toEqual(['https://v.redd.it/z/DASH_480.mp4']);
  });

  it('ignores a bare v.redd.it page URL and non-allowlisted hosts', () => {
    expect(extractVideo(makePost({ type: 'video', contentHref: 'https://v.redd.it/abc123' }))).toBeNull();
    expect(
      extractVideo(makePost({ type: 'video', inner: '<video src="https://cdn.evil.com/a.mp4"></video>' })),
    ).toBeNull();
  });

  it('survives malformed JSON', () => {
    const ref = extractVideo(
      makePost({
        type: 'video',
        inner: `<shreddit-player packaged-media-json="{not json" src="https://v.redd.it/q/DASH_360.mp4"></shreddit-player>`,
      }),
    );
    expect(ref?.urls).toEqual(['https://v.redd.it/q/DASH_360.mp4']);
  });
});

describe('redditAdapter.extractMedia / isMediaPost', () => {
  it('returns null for text, link and unknown post types', () => {
    for (const type of ['text', 'link', undefined]) {
      const post = makePost({
        type,
        contentHref: 'https://i.redd.it/a.jpg',
        inner: '<img src="https://i.redd.it/b.jpg">',
      });
      expect(redditAdapter.extractMedia(post)).toBeNull();
      expect(redditAdapter.isMediaPost(post)).toBe(false);
    }
  });

  it('treats a crosspost as a media post and reads the original media from the DOM', () => {
    const post = makePost({ type: 'crosspost', inner: '<img src="https://i.redd.it/b.jpg">' });
    expect(redditAdapter.isMediaPost(post)).toBe(true);
    expect(redditAdapter.extractMedia(post)?.urls).toContain('https://i.redd.it/b.jpg');
  });

  it('dispatches by post-type', () => {
    expect(redditAdapter.extractMedia(makePost({ type: 'image', contentHref: 'https://i.redd.it/a.jpg' }))?.kind).toBe('image');
    expect(redditAdapter.isMediaPost(makePost({ type: 'video' }))).toBe(true);
  });
});
