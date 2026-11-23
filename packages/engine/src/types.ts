export type SourceFeed =
  | "for_you"
  | "following"
  | "list"
  | "search"
  | "profile"
  | "post_detail"
  | "other";

export type ClientKind = "extension" | "android" | "ios" | "unknown";

export interface PostCandidate {
  id: string;
  authorHandle: string;
  authorName: string;
  text: string;
  isRepost: boolean;
  repostedBy?: string;
  isQuote: boolean;
  quotedText?: string;
  isPromoted: boolean;
  hasMedia: boolean;
  hasVideo: boolean;
  links: string[];
  hashtags: string[];
  sourceFeed: SourceFeed;
  timestamp?: string;
}

export interface KeywordRule {
  id: string;
  pattern: string;
  isRegex: boolean;
  /** Positive boosts the post, negative penalizes it. */
  weight: number;
  label?: string;
  enabled: boolean;
}

export interface ContentFilters {
  hidePromoted: boolean;
  hideReposts: boolean;
  hideLinksOnly: boolean;
  /** Hide posts shorter than this many characters (0 disables). */
  hideShortPostsBelow: number;
}

export interface Thresholds {
  hideBelow: number;
  collapseBelow: number;
  boostAbove: number;
}

export interface UiOptions {
  enabled: boolean;
  displayMode: "collapse" | "hide";
  showScoreBadge: boolean;
  forwardNotInterestedToX: boolean;
  observeNativeXFeedback: boolean;
  hideRightSidebar: boolean;
  wideTimeline: boolean;
  /** Layer 1: automatically downrank/collapse near-duplicate headlines already seen in the last 24h. */
  dedupeRepeatedStories: boolean;
}

/** Temporary 24-48h story snooze — never poisons the long-term taste learner. */
export interface StorySnooze {
  id: string;
  postId: string;
  label: string;
  terms: string[];
  embedding?: number[];
  createdAt: string;
  expiresAt: string;
  sourceClient: ClientKind;
}

export interface SeenStoryRecord {
  postId: string;
  authorHandle: string;
  terms: string[];
  seenAt: number;
}

export interface TasteProfile {
  /** Plain-English feed philosophy edited directly by the user. */
  philosophy: string;
  /** Human-readable distilled taste rules updated by Loop B reflection or manual edits. */
  learnedRules: string[];
  /** Enables Loop A batched AI / semantic taste judging. */
  aiJudgeEnabled: boolean;
}

export interface ScorerWeights {
  tasteJudge: number;
  learnedModel: number;
  authorWeights: number;
  keywordRules: number;
}

export interface EmbeddingHeadParams {
  modelId: string;
  dim: number;
  trainedOnCount: number;
  weights: number[];
  bias: number;
  updatedAt: string;
}

/**
 * Loop C: Cloud-synced personal model parameters trained from multi-device feedback.
 * Includes both offline sparse token weights and Speed 1 384-dim embedding logistic head (~2.5 KB).
 */
export interface LearnedModelParams {
  version: 1;
  trainedOnCount: number;
  bias: number;
  featureWeights: Record<string, number>;
  embeddingHead?: EmbeddingHeadParams | null;
  scorerWeights: ScorerWeights;
  updatedAt: string;
}

export interface TuningProfile {
  version: 1;
  revision: number;
  updatedAt: string;
  rules: KeywordRule[];
  /** Author handle (lowercase, without @) -> weight delta. <= -10 acts as a hard mute. */
  authorWeights: Record<string, number>;
  contentFilters: ContentFilters;
  thresholds: Thresholds;
  uiOptions: UiOptions;
  tasteProfile: TasteProfile;
  learnedModel: LearnedModelParams;
  /** Active temporary 24h story snoozes (auto-pruned after expiry, synced across devices). */
  storySnoozes: StorySnooze[];
  /** Extension point for future custom/ML/LLM scorers without changing the profile schema. */
  customScorerConfig: Record<string, unknown>;
}

export type FeedbackAction =
  | "downvote"
  | "upvote"
  | "seen_story"
  | "false_positive"
  | "less_author"
  | "mute_author"
  | "boost_author"
  // Legacy aliases preserved for backward compatibility with stored events
  | "farming"
  | "good_post"
  | "not_interested"
  | "less_like_this"
  | "more_like_this";

export interface FeedbackEvent {
  id: string;
  postId: string;
  authorHandle: string;
  action: FeedbackAction;
  reasonTag?: string;
  syncedToX: boolean;
  sourceClient: ClientKind;
  createdAt: string;
  postSnippet?: string;
  quotedSnippet?: string;
  terms?: string[];
  /** Optional semantic embedding vector stored in cloud D1 for cross-device Loop A retrieval. */
  embedding?: number[];
}

export interface FeedbackInput {
  post: Pick<PostCandidate, "id" | "authorHandle" | "text" | "hashtags" | "quotedText">;
  action: FeedbackAction;
  reasonTag?: string;
  syncedToX?: boolean;
  sourceClient?: ClientKind;
  now?: number;
}

export type JudgeCategory =
  | "insight"
  | "counterpoint"
  | "casual"
  | "news"
  | "farming"
  | "rage_bait"
  | "promo"
  | "low_fit"
  | "neutral";

export interface JudgeVerdict {
  postId: string;
  /** 0-10: genuine human value (informative, counterpoint, humor, lived experience) */
  worthwhile: number;
  /** 0-10: likelihood of low-value / engagement farming / off-taste content */
  farming: number;
  category: JudgeCategory;
  reason: string;
  similarExampleIds: string[];
  source: "workers-ai" | "embedding-head" | "story-snooze" | "local-rubric" | "cache";
  evaluatedAt: string;
}

export type DecisionAction = "show" | "boost" | "collapse" | "hide";

export interface DecisionReason {
  scorerId: string;
  delta: number;
  message: string;
}

export interface Decision {
  postId: string;
  action: DecisionAction;
  score: number;
  reasons: DecisionReason[];
  verdict?: JudgeVerdict;
  evaluatedAt: number;
}

export interface ScorerResult {
  delta: number;
  reasons: DecisionReason[];
  hardAction?: "hide" | "collapse" | "show" | "boost";
}

export interface ScoringContext {
  profile: TuningProfile;
  feedbackHistory: FeedbackEvent[];
  judgeVerdict?: JudgeVerdict;
  seenStories?: SeenStoryRecord[];
  now: number;
}

/** Synchronous scorer interface for zero-jank in-place feed scoring. */
export interface PostScorer {
  readonly id: string;
  score(post: PostCandidate, ctx: ScoringContext): ScorerResult;
}

/** Asynchronous scorer interface for future LLM, embedding, or remote ML scorers. */
export interface AsyncPostScorer {
  readonly id: string;
  scoreAsync(post: PostCandidate, ctx: ScoringContext): Promise<ScorerResult>;
}

export interface SyncConfig {
  endpointUrl: string;
  apiToken: string;
  enabled: boolean;
  deviceId: string;
}

export interface SyncStateSnapshot {
  profile: TuningProfile | null;
  feedback: FeedbackEvent[];
  learnedModel?: LearnedModelParams | null;
  serverTime: string;
}
