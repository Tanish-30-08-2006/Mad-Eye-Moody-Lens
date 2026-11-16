import { describe, expect, it } from 'vitest';
import { readOriginals } from '../../src/background/post-json';
import { observeImage } from '../../src/background/post-source';
import { redditPost } from '../../src/core/reddit-context';

describe('Reddit provenance', () => {
  it('reads only explicit relationships, keeping the title and flair on their own post', () => {
    const original = { id: 'a', permalink: '/r/art/comments/a/original/', title: 'My art', link_flair_text: 'AI Art', created_utc: 1700000000 };
    const intermediate = { id: 'b', permalink: '/r/pics/comments/b/another/', title: 'Different title', crosspost_parent_list: [original] };
    const repost = { crosspost_parent: 't3_b', crosspost_parent_list: [intermediate] };
    expect(readOriginals(repost, 'c')).toMatchObject([
      { title: 'Different title', permalink: 'https://www.reddit.com/r/pics/comments/b/' },
      { title: 'My art', flair: 'AI Art', subreddit: 'art', date: '2023-11-14T22:13:20.000Z' },
    ]);
    expect(readOriginals({ url: original.permalink, selftext: original.permalink }, 'c')).toEqual([]);
    expect(readOriginals({ crosspost_parent: 't3_a' }, 'c')).toMatchObject([
      { permalink: 'https://www.reddit.com/comments/a/', unavailable: true },
    ]);
    expect(readOriginals({ crosspost_parent: 't3_c' }, 'c')).toEqual([]);
    expect(readOriginals({ crosspost_parent_list: [{ ...original, selftext: '[deleted]' }] }, 'c')[0]?.unavailable).toBe(true);
  });

  it('rejects unsafe or mis-scoped links and canonicalizes known post URLs', () => {
    expect(redditPost('https://old.reddit.com/r/art/comments/a/title/?utm_source=foo#one')?.permalink)
      .toBe('https://www.reddit.com/r/art/comments/a/');
    for (const link of ['https://evil.test/r/art/comments/a/', 'https://u@www.reddit.com/comments/a', '/r/art/comments/a/title/comment/', '/r/art/s/tok']) {
      expect(redditPost(link)).toBeNull();
    }
  });

  it('returns an earlier observed exact match without promoting it to an original', () => {
    const a = 'https://www.reddit.com/r/a/comments/first/';
    const b = 'https://www.reddit.com/r/b/comments/second/';
    const first = observeImage([], 'a-hash', a, 100);
    expect(first.earlier).toBeUndefined();
    expect(observeImage(first.rows, 'other-hash', b, 101).earlier).toBeUndefined();
    const second = observeImage(first.rows, 'a-hash', b, 102);
    expect(second.earlier).toMatchObject({ permalink: a, firstObserved: 100 });
    expect(observeImage(second.rows, 'a-hash', a, 103).earlier).toBeUndefined();
    expect(observeImage(second.rows, 'a-hash', b, 104).rows).toEqual(second.rows);
    expect(observeImage(second.rows, 'a-hash', b, 31 * 86400000).earlier).toBeUndefined();
  });
});
