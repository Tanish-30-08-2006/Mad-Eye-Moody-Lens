/**
 * tests/helpers/synthetic-posts.ts – SYNTHETIC post fixtures for unit tests.
 *
 * Built only from the verified attributes (post-type, content-href, permalink, id,
 * post-title). Inner markup (<img>, <shreddit-player>, ...) is invented and is NOT a
 * recording of real Reddit; it only exercises the defensive parsing paths.
 */

export interface PostSpec {
  id?: string;
  type?: string;
  contentHref?: string;
  title?: string;
  inner?: string;
  attrs?: Record<string, string>;
}

export function makePost(spec: PostSpec = {}): HTMLElement {
  const id = spec.id ?? 't3_abc';
  const post = document.createElement('shreddit-post');
  post.setAttribute('id', id);
  post.setAttribute('permalink', `/r/test/comments/${id}/synthetic/`);
  post.setAttribute('post-title', spec.title ?? 'Synthetic post');
  if (spec.type) post.setAttribute('post-type', spec.type);
  if (spec.contentHref) post.setAttribute('content-href', spec.contentHref);
  for (const [k, v] of Object.entries(spec.attrs ?? {})) post.setAttribute(k, v);
  if (spec.inner) post.innerHTML = spec.inner;
  return post;
}

/** Wraps posts like the real structure: <shreddit-feed><article><shreddit-post>. */
export function makeFeed(posts: HTMLElement[]): HTMLElement {
  const feed = document.createElement('shreddit-feed');
  for (const post of posts) {
    const article = document.createElement('article');
    article.appendChild(post);
    feed.appendChild(article);
  }
  return feed;
}

/** Controllable IntersectionObserver stand-in; happy-dom's never fires. */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed = new Set<Element>();
  disconnected = false;
  constructor(private cb: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.disconnected = true;
    this.observed.clear();
  }
  takeRecords() {
    return [];
  }
  /** Marks elements visible and notifies, like the browser would. */
  show(...els: Element[]) {
    const entries = els
      .filter((el) => this.observed.has(el))
      .map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry);
    this.cb(entries, this as unknown as IntersectionObserver);
  }
  static reset() {
    FakeIntersectionObserver.instances = [];
  }
  static get latest() {
    return FakeIntersectionObserver.instances[FakeIntersectionObserver.instances.length - 1]!;
  }
}
