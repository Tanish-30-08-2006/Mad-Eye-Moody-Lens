import { communityName, type PostType } from '../../core/community-policy';
import { COMPOSER_ATTACHMENT, COMPOSER_COMMUNITY, COMPOSER_FLAIR, COMPOSER_PATH, COMPOSER_POST_TYPE, COMPOSER_SELECTOR } from './selectors';
import { watchNavigation } from './spa-navigation';

export interface ComposerSnapshot {
  root: HTMLElement;
  subreddit: string | null;
  postType: PostType;
  files: File[];
  flairControl: HTMLButtonElement | null;
  repost?: string;
}

export function readComposer(doc: Document = document, url = new URL(location.href)): ComposerSnapshot | null {
  if (!COMPOSER_PATH.test(url.pathname)) return null;
  const root = doc.querySelector<HTMLElement>(COMPOSER_SELECTOR);
  if (!root?.isConnected) {
    const main = doc.querySelector<HTMLElement>('main');
    return main ? { root: main, subreddit: null, postType: 'unknown', files: [], flairControl: null } : null;
  }
  const community = root.querySelector<HTMLElement>(COMPOSER_COMMUNITY);
  const value = (community instanceof HTMLSelectElement ? community.value : community?.getAttribute('subreddit-name')
    ?? community?.getAttribute('value') ?? root.getAttribute('subreddit-name'))?.replace(/^r\//i, '').toLowerCase();
  const subreddit = value && communityName.test(value) ? value : null;
  const type = root.querySelector<HTMLElement>(COMPOSER_POST_TYPE);
  const selectedType = (type?.getAttribute('value') ?? type?.textContent ?? '').trim().toLowerCase();
  const files = Array.from(root.querySelectorAll<HTMLInputElement>(COMPOSER_ATTACHMENT))
    .filter((input) => !input.disabled)
    .flatMap((input) => Array.from(input.files ?? []));
  const postType: PostType = /^video$/.test(selectedType) || (files.length > 0 && files[0]?.type.startsWith('video/'))
    ? 'video' : /^(?:image|images & video|images and video)$/.test(selectedType) ? 'image'
      : /^(?:text|self)$/.test(selectedType) ? 'text' : selectedType === 'link' ? 'link' : 'unknown';
  const source = /^t3_([a-z0-9]+)$/i.exec(url.searchParams.get('source_id') ?? '');
  return {
    root, subreddit, postType, files,
    flairControl: root.querySelector<HTMLButtonElement>(COMPOSER_FLAIR),
    repost: source ? '/comments/' + source[1] + '/' : undefined,
  };
}

export const sameDraft = (a: ComposerSnapshot | null, b: ComposerSnapshot | null) => a === b || (
  !!a && !!b && a.root === b.root && a.subreddit === b.subreddit && a.postType === b.postType && a.repost === b.repost &&
  a.files.length === b.files.length && a.files.every((file, i) => file === b.files[i])
);

export function watchComposer(onChange: (snapshot: ComposerSnapshot | null) => void): () => void {
  let previous: ComposerSnapshot | null = null;
  let observer: MutationObserver | undefined;
  let scheduled = false;
  let stopped = false;
  const read = () => {
    if (stopped) return;
    const column = readComposer();
    if (sameDraft(previous, column) && previous?.flairControl === column?.flairControl) return;
    previous = column;
    onChange(column);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; read(); });
  };
  const route = () => {
    observer?.disconnect();
    observer = undefined;
    if (COMPOSER_PATH.test(location.pathname)) {
      observer = new MutationObserver(schedule);
      observer.observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['subreddit-name', 'aria-selected', 'value', 'name', 'disabled'],
      });
    }
    read();
  };
  const stopNav = watchNavigation(route);
  document.addEventListener('change', schedule, true);
  route();
  return () => {
    stopped = true;
    stopNav();
    observer?.disconnect();
    document.removeEventListener('change', schedule, true);
  };
}
