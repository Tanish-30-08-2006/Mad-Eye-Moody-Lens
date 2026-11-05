/**
 * tests/unit/dash-audio.test.ts – v.redd.it audio lookup from a synthetic DASH MPD. Label: RUNTIME (pure functions, fake fetch).
 */
import { describe, it, expect, vi } from 'vitest';
import { audioCandidates, mpdUrlFor, parseAudioFromMpd, resolveAudio } from '../../src/background/dash-audio';

const MPD = `<?xml version="1.0"?><MPD><Period>
<AdaptationSet contentType="video"><Representation id="v1"><BaseURL>DASH_720.mp4</BaseURL></Representation></AdaptationSet>
<AdaptationSet contentType="audio"><Representation id="a1" bandwidth="64000"><BaseURL>CMAF_AUDIO_64.mp4</BaseURL></Representation></AdaptationSet>
</Period></MPD>`;
const VIDEO = 'https://v.redd.it/abc123/DASH_720.mp4';
const MPD_URL = 'https://v.redd.it/abc123/DASHPlaylist.mpd';

describe('dash audio', () => {
  it('derives the manifest URL only for v.redd.it videos', () => {
    expect(mpdUrlFor(VIDEO)).toBe(MPD_URL);
    expect(mpdUrlFor('https://i.redd.it/a.jpg')).toBeNull();
  });

  it('reads the audio file name from the manifest instead of guessing it', () => {
    expect(audioCandidates(MPD).length).toBeGreaterThan(0);
    expect(parseAudioFromMpd(MPD, MPD_URL)).toBe('https://v.redd.it/abc123/CMAF_AUDIO_64.mp4');
  });

  it('returns found / none / failed', async () => {
    expect(await resolveAudio(VIDEO, async () => MPD)).toEqual({ status: 'found', url: 'https://v.redd.it/abc123/CMAF_AUDIO_64.mp4' });
    const silent = '<MPD><Period><AdaptationSet contentType="video"><Representation id="v"><BaseURL>DASH_720.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>';
    expect(await resolveAudio(VIDEO, async () => silent)).toEqual({ status: 'none' });
    expect(await resolveAudio(VIDEO, vi.fn().mockRejectedValue(new Error('x')))).toEqual({ status: 'failed' });
    expect(await resolveAudio(VIDEO, async () => 'not xml')).toEqual({ status: 'failed' });
    expect(await resolveAudio('https://i.redd.it/a.jpg', async () => MPD)).toEqual({ status: 'none' });
  });
});
