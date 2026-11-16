// @vitest-environment happy-dom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, render } from '../helpers/react';
import { parseCommunityFlair, parseCommunityRules } from '../../src/background/community-policy';
import { readComposer, sameDraft } from '../../src/adapters/reddit/composer';
import { ComposerPanel } from '../../src/ui/ComposerPanel';
import { DEFAULT_SETTINGS } from '../../src/core/settings';
import type { ExtensionMessage, ExtensionResponse } from '../../src/core/messaging';
import { relevantRules } from '../../src/core/community-policy';

const submit = new URL('https://www.reddit.com/submit');

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

function draft() {
  document.body.innerHTML = '<shreddit-composer><select name="sr"><option value="art">Art</option><option value="photos">Photos</option></select><button role="tab" aria-selected="true">Images &amp; Video</button><textarea>Keep my draft</textarea><input type="file"><button type="button" name="flair" aria-haspopup="dialog">Flair</button></shreddit-composer>';
  const input = document.querySelector<HTMLInputElement>('input')!;
  const file = new File(['picture'], 'draft.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  return { input, file };
}

it('keeps a requirement, prohibition and conditional rule distinct and scoped by post type', () => {
  const rules = parseCommunityRules({ rules: [
    { short_name: 'AI art', description: 'AI art posts must use the AI Art flair.', kind: 'link' },
    { short_name: 'Video policy', description: 'AI-generated videos are prohibited.', kind: 'all' },
    { short_name: 'AI in our wiki', description: 'AI content is not allowed except for approved cases.' },
    { short_name: 'AI-generated images', description: 'AI-generated images must be disclosed.' },
    { short_name: 'No AI content', description: 'Applies only to comments', kind: 'comment' },
  ] });
  expect(rules?.map((rule) => rule.kind)).toEqual(['flair', 'prohibition', 'unclear', 'disclosure']);
  const policy = { subreddit: 'art', rules, flair: parseCommunityFlair([{ text: 'AI Art' }, { text: 'AI Video', mod_only: true }]) };
  expect(policy.flair).toEqual(['AI Art']);
  expect(relevantRules(policy, 'image')?.map((rule) => rule.kind)).toEqual(['flair', 'unclear', 'disclosure']);
  expect(parseCommunityRules({ message: 'Forbidden' })).toBeNull();
});

it('discards a request for the previous destination and never rewrites the draft', async () => {
  const { input } = draft();
  const original = readComposer(document, submit)!;
  const current = () => readComposer(document, submit);
  let release!: (response: ExtensionResponse) => void;
  const send = vi.fn((msg: ExtensionMessage): Promise<ExtensionResponse> => msg.type === 'GET_COMMUNITY_POLICY'
    ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({ type: 'CONSENT', accepted: false }));
  const app = await render(<ComposerPanel snapshot={original} settings={DEFAULT_SETTINGS} isCurrent={() => sameDraft(current(), original)} send={send} />);
  try {
    document.querySelector('select')!.value = 'photos';
    await act(async () => release({ type: 'COMMUNITY_POLICY', policy: {
      subreddit: 'art', rules: [{ kind: 'flair', title: 'AI art', excerpt: 'AI art requires flair', media: 'image' }], flair: ['AI Art'],
    } }));
    expect(app.container.textContent).not.toContain('AI art requires flair');
    const selected = current()!;
    expect(selected.subreddit).toBe('photos');
    await act(async () => app.root.render(<ComposerPanel key="photos" snapshot={selected} settings={DEFAULT_SETTINGS} isCurrent={() => sameDraft(current(), selected)} send={send} />));
    await act(async () => release({ type: 'COMMUNITY_POLICY', policy: {
      subreddit: 'photos', rules: [{ kind: 'prohibition', title: 'AI images', excerpt: 'AI images prohibited', media: 'image' }], flair: null,
    } }));
    expect(app.container.textContent).toContain('AI images prohibited');
    const button = (name: string) => Array.from(app.container.querySelectorAll('button')).find((b) => b.textContent === name)!;
    await act(async () => button('Review upload').click());
    await act(async () => button('Upload and scan').click());
    await act(async () => button('Not now').click());
    expect(app.container.textContent).toContain('Upload declined');
    expect(send.mock.calls.map(([m]) => m.type)).not.toContain('SCAN_DRAFT');
    Object.defineProperty(input, 'files', { value: [new File(['other'], 'draft.png', { type: 'image/png' })] });
    expect(sameDraft(selected, current())).toBe(false);
    expect(document.querySelector('shreddit-composer textarea')?.value).toBe('Keep my draft');
  } finally {
    app.unmount();
  }
});
