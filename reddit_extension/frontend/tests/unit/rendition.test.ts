/**
 * tests/unit/rendition.test.ts – Progressive MP4 rendition picker. Label: STATIC (pure functions).
 */
import { describe, it, expect } from 'vitest';
import { pickRenditions, renditionHeight } from '../../src/background/rendition';

const u = (name: string) => `https://v.redd.it/vid/${name}`;

describe('renditionHeight', () => {
  it('reads the height from DASH_/CMAF_ names and ignores query strings', () => {
    expect(renditionHeight(u('DASH_480.mp4?source=fallback'))).toBe(480);
    expect(renditionHeight(u('CMAF_720.mp4'))).toBe(720);
    expect(renditionHeight(u('DASH_1080.mp4'))).toBe(1080);
  });
  it('returns null when the name has no height', () => {
    expect(renditionHeight(u('video.mp4'))).toBeNull();
    expect(renditionHeight(u('DASH_audio.mp4'))).toBeNull();
  });
});

describe('pickRenditions', () => {
  it('prefers the tallest rendition up to 480p', () => {
    const r = pickRenditions([u('DASH_1080.mp4'), u('DASH_720.mp4'), u('DASH_480.mp4'), u('DASH_360.mp4'), u('DASH_240.mp4')]);
    expect(r.candidates.slice(0, 2)).toEqual([u('DASH_480.mp4'), u('DASH_360.mp4')]);
    expect(r.streamingOnly).toBe(false);
  });

  it('falls back to the smallest larger rendition when nothing is <=480p', () => {
    const r = pickRenditions([u('DASH_1080.mp4'), u('DASH_720.mp4')]);
    expect(r.candidates).toEqual([u('DASH_720.mp4'), u('DASH_1080.mp4')]);
  });

  it('ranks unknown-height files between preferred and larger', () => {
    const r = pickRenditions([u('DASH_720.mp4'), u('clip.mp4'), u('CMAF_360.mp4')]);
    expect(r.candidates).toEqual([u('CMAF_360.mp4'), u('clip.mp4'), u('DASH_720.mp4')]);
  });

  it('ignores HLS/DASH manifests when an MP4 exists', () => {
    const r = pickRenditions([u('HLSPlaylist.m3u8'), u('DASH.mpd'), u('DASH_360.mp4')]);
    expect(r.candidates).toEqual([u('DASH_360.mp4')]);
    expect(r.streamingOnly).toBe(false);
  });

  it('flags HLS/DASH-only videos as streaming-only', () => {
    const r = pickRenditions([u('HLSPlaylist.m3u8'), u('DASH.mpd')]);
    expect(r).toEqual({ candidates: [], streamingOnly: true });
  });

  it('handles an empty list', () => {
    expect(pickRenditions([])).toEqual({ candidates: [], streamingOnly: false });
  });
});
