const hosts = new Set(['reddit.com', 'www.reddit.com', 'sh.reddit.com', 'old.reddit.com']);

/** Only Reddit post paths, never tracking links, redirects, comment paths, or credentials. */
export function redditPost(raw: string): { permalink: string; id: string; subreddit?: string } | null {
  try {
    const url = new URL(raw, 'https://www.reddit.com');
    if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.port || url.username || url.password) return null;
    const match = /^\/(?:r\/([a-z0-9_]+)\/)?comments\/([a-z0-9]+)(?:\/[a-z0-9_-]+)?\/?$/i.exec(url.pathname);
    if (!match) return null;
    const subreddit = match[1];
    const id = match[2]!.toLowerCase();
    return { id, subreddit, permalink: 'https://www.reddit.com' + (subreddit ? '/r/' + subreddit : '') + '/comments/' + id + '/' };
  } catch {
    return null;
  }
}

export interface PostDetails {
  permalink?: string;
  subreddit?: string;
  title?: string;
  date?: string;
  flair?: string;
  unavailable?: boolean;
}

export interface PostSource {
  current: PostDetails;
  originals: PostDetails[];
  possible?: { permalink: string; firstObserved: number };
}
