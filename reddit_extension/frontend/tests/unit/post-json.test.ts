/**
 * tests/unit/post-json.test.ts – Post JSON resolver on synthetic payloads. Label: RUNTIME (field names are UNVERIFIED).
 */
import { describe, it, expect } from 'vitest';
import { parsePostJson, postJsonUrl, MAX_GALLERY_IMAGES } from '../../src/background/post-json';

const wrap = (data: object) => [{ data: { children: [{ data }] } }];

describe('post JSON resolver', () => {
  it('builds a .json URL only for https Reddit permalinks', () => {
    expect(postJsonUrl('https://www.reddit.com/r/x/comments/abc/t/')).toBe('https://www.reddit.com/r/x/comments/abc/t/.json?raw_json=1');
    expect(postJsonUrl('http://www.reddit.com/r/x/')).toBeNull();
    expect(postJsonUrl('https://evil.example/r/x/')).toBeNull();
  });

  it('resolves a gallery in order, capped at 10, allowlisted hosts only', () => {
    const ids = Array.from({ length: 14 }, (_, i) => `m${i}`);
    const media_metadata = Object.fromEntries(ids.map((id) => [id, { s: { u: `https://i.redd.it/${id}.jpg` } }]));
    media_metadata.m1 = { s: { u: 'https://evil.example/x.jpg' } };
    const out = parsePostJson(wrap({ gallery_data: { items: ids.map((media_id) => ({ media_id })) }, media_metadata }));
    expect(out?.kind).toBe('gallery');
    expect(out!.urls.length).toBe(MAX_GALLERY_IMAGES);
    expect(out!.urls).not.toContain('https://evil.example/x.jpg');
  });

  it('resolves a video with its manifest', () => {
    const out = parsePostJson(wrap({ secure_media: { reddit_video: { fallback_url: 'https://v.redd.it/a/DASH_720.mp4', dash_url: 'https://v.redd.it/a/DASHPlaylist.mpd' } } }));
    expect(out).toMatchObject({ kind: 'video', mediaType: 'video', mpdUrl: 'https://v.redd.it/a/DASHPlaylist.mpd' });
  });

  it('follows a crosspost to its parent and ignores junk', () => {
    const parent = { secure_media: { reddit_video: { fallback_url: 'https://v.redd.it/p/DASH_480.mp4' } } };
    expect(parsePostJson(wrap({ crosspost_parent_list: [parent] }))?.urls[0]).toBe('https://v.redd.it/p/DASH_480.mp4');
    expect(parsePostJson({})).toBeNull();
    expect(parsePostJson(null)).toBeNull();
  });
});
