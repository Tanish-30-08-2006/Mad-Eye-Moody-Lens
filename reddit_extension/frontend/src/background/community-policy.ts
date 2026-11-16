import { type CommunityPolicy, type CommunityRule, communityName } from '../core/community-policy';
import { fetchRedditJson } from './post-json';
import { ScanQueue } from './scan-queue';

const ai = /\b(?:AI(?:[- ](?:generated|assisted|art|imagery|content|media|images|videos))?|A\.I\.|artificial intelligence|synthetic (?:media|images|audio|video)|deepfakes?)\b/i;
const uncertainty = /\b(?:unless|except|exempt|may not apply|might|case.by.case|see (?:the )?wiki)\b/i;
const prohibit = /(?:^|\b)(?:no\s+(?:(?:posting|sharing)\s+)?(?:AI\b|synthetic\b|deepfakes?\b)|(?:AI[- ]generated|deepfakes?|synthetic media)[^.!?]{0,80}\b(?:prohibited|banned|forbidden|not allowed)|(?:do not|don’t|don't|must not)\s+(?:post|submit|share)[^.!?]{0,50}(?:\bAI\b|synthetic|deepfake))/i;
const required = /\b(?:must|required|require|mandatory|needs? to|has to|have to)\b/i;
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const plain = (v: unknown): string => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';

export function parseCommunityRules(raw: unknown): CommunityRule[] | null {
  const source = record(raw).rules;
  if (!Array.isArray(source)) return null;
  const rules: CommunityRule[] = [];
  for (const row of source.slice(0, 40)) {
    const rule = record(row);
    if (rule.kind === 'comment') continue;
    const title = plain(rule.short_name);
    const description = plain(rule.description);
    const text = (title + '. ' + description).slice(0, 5_000);
    if (!ai.test(text)) continue;
    const relevant = text.split(/(?<=[.!?])\s+/).filter((sentence) => ai.test(sentence));
    const context = relevant.join(' ');
    const uncertain = uncertainty.test(context) || /\b(?:not required|not mandatory|optional)\b/i.test(context);
    const kinds: CommunityRule['kind'][] = [];
    if (!uncertain && prohibit.test(context)) kinds.push('prohibition');
    if (!uncertain && required.test(context) && /\bflair\b/i.test(context)) kinds.push('flair');
    if (!uncertain && required.test(context) && /\b(?:disclos\w*|state|declare|mention)\b/i.test(context)) kinds.push('disclosure');
    const image = /\b(?:images?|art|photos?|illustrations?)\b/i.test(context);
    const video = /\b(?:videos?|clips?)\b/i.test(context);
    const media = image === video || /\b(?:all posts|all content|all media)\b/i.test(context) ? 'any' : image ? 'image' : 'video';
    const excerpt = (description || title).slice(0, 360);
    for (const kind of kinds.length ? kinds : ['unclear'] as const) {
      rules.push({ title: title.slice(0, 120) || 'Community rule', excerpt, media, kind });
    }
  }
  return rules;
}

export function parseCommunityFlair(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.slice(0, 120).flatMap((value) => {
    const flair = record(value);
    const name = plain(flair.text);
    return flair.mod_only !== true && name && ai.test(name) ? [name.slice(0, 120)] : [];
  }))];
}

const policies = new Map<string, { until: number; promise: Promise<CommunityPolicy> }>();
const requests = new ScanQueue(2);

export function getCommunityPolicy(name: string): Promise<CommunityPolicy> {
  const subreddit = name.toLowerCase();
  if (!communityName.test(subreddit)) return Promise.resolve({ subreddit: '', rules: null, flair: null });
  const previous = policies.get(subreddit);
  if (previous && previous.until > Date.now()) return previous.promise;
  const base = 'https://www.reddit.com/r/' + subreddit;
  const promise = requests.run(subreddit, () => Promise.all([
    fetchRedditJson(base + '/about/rules.json?raw_json=1'),
    fetchRedditJson(base + '/api/link_flair_v2.json?raw_json=1'),
  ]).then(([rules, flair]) => ({ subreddit, rules: parseCommunityRules(rules), flair: parseCommunityFlair(flair) })));
  policies.delete(subreddit);
  policies.set(subreddit, { until: Date.now() + 5 * 60_000, promise });
  if (policies.size > 48) policies.delete(policies.keys().next().value!);
  return promise;
}
