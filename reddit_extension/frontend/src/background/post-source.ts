import { fetchMediaBlob } from './media-fetcher';
import { sha256 } from './fingerprint';
import { fetchPostListing, readOriginals, readPostDetails } from './post-json';
import { ScanQueue } from './scan-queue';
import { redditPost, type PostSource } from '../core/reddit-context';

export const IMAGE_OBSERVATIONS_KEY = 'moodyLensImageObservations';
const MAX_OBSERVATIONS = 300;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
interface Observation {
  hash: string;
  permalink: string;
  firstObserved: number;
}

export function observeImage(rows: Observation[], hash: string, permalink: string, now = Date.now()) {
  const id = redditPost(permalink)?.id;
  const retained = rows.filter((r) => r.firstObserved > now - MAX_AGE_MS);
  const samePost = (r: Observation) => redditPost(r.permalink)?.id === id;
  const matches = retained.filter((r) => r.hash === hash && !samePost(r))
    .sort((a, b) => a.firstObserved - b.firstObserved || a.permalink.localeCompare(b.permalink));
  const earlier = matches.find((r) => r.firstObserved < (retained.find((p) => p.hash === hash && samePost(p))?.firstObserved ?? now));
  if (!retained.some((r) => r.hash === hash && samePost(r))) retained.push({ hash, permalink, firstObserved: now });
  return { rows: retained.slice(-MAX_OBSERVATIONS), earlier };
}

// One short local transaction at a time; network requests can still run in parallel.
const writes = new ScanQueue(1);
const requests = new ScanQueue();
const listings = new Map<string, { until: number; promise: Promise<PostSource> }>();

export function getPostSource(permalink: string, explicit: boolean, imageUrl?: string): Promise<PostSource | null> {
  const post = redditPost(permalink);
  if (!post) return Promise.resolve(null);
  return requests.run(JSON.stringify([post.id, explicit, imageUrl]), async () => {
    let entry = listings.get(post.id);
    if (!entry || entry.until < Date.now()) {
      const promise = fetchPostListing(post.permalink).then((listing) => {
        const details = listing && redditPost(String(listing.permalink))?.id === post.id ? listing : null;
        return {
          current: { ...post, ...(details ? readPostDetails(details) : {}) },
          originals: details ? readOriginals(details, post.id) : [],
        };
      });
      entry = { until: Date.now() + 5 * 60_000, promise };
      listings.delete(post.id);
      listings.set(post.id, entry);
      if (listings.size > 96) listings.delete(listings.keys().next().value!);
    }
    const { current, originals: linked } = await entry.promise;
    const originals = [...linked];
    if (explicit && !originals.length) originals.push({ unavailable: true });
    let possible: PostSource['possible'];
    if (!originals.length && imageUrl) {
      try {
        const { blob, contentType } = await fetchMediaBlob(imageUrl, { maxBytes: 10 * 1024 * 1024, timeoutMs: 10_000 });
        if (contentType.startsWith('image/')) {
          const hash = await sha256(blob);
          possible = await writes.run(post.id + ':' + hash, async () => {
            const saved = (await chrome.storage.local.get(IMAGE_OBSERVATIONS_KEY))[IMAGE_OBSERVATIONS_KEY];
            const { rows, earlier } = observeImage(Array.isArray(saved) ? saved : [], hash, post.permalink);
            await chrome.storage.local.set({ [IMAGE_OBSERVATIONS_KEY]: rows });
            return earlier && { permalink: earlier.permalink, firstObserved: earlier.firstObserved };
          });
        }
      } catch {
        // An unreadable image or unavailable local storage cannot establish a match.
      }
    }
    return { current, originals, possible };
  });
}
