export type PostType = 'image' | 'video' | 'text' | 'link' | 'unknown';
export type RuleKind = 'prohibition' | 'disclosure' | 'flair' | 'unclear';
export interface CommunityRule {
  kind: RuleKind;
  title: string;
  excerpt: string;
  media: 'image' | 'video' | 'any';
}

export interface CommunityPolicy {
  subreddit: string;
  rules: CommunityRule[] | null;
  flair: string[] | null;
}

export const communityName = /^[a-z0-9_]{2,21}$/i;
export const rulesLink = (subreddit: string) => 'https://www.reddit.com/r/' + subreddit + '/about/rules/';

export function relevantRules(policy: CommunityPolicy, postType: PostType): CommunityRule[] | null {
  return policy.rules?.filter((rule) => postType === 'unknown' || rule.media === 'any' || rule.media === postType) ?? null;
}

export const ruleLabel: Record<RuleKind, string> = {
  prohibition: 'Prohibition',
  disclosure: 'Disclosure requirement',
  flair: 'Flair requirement',
  unclear: 'Read to confirm applicability',
};
