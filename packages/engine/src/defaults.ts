import type {
  LearnedModelParams,
  SyncConfig,
  TasteProfile,
  TuningProfile,
} from "./types.ts";

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "your", "have", "just",
  "about", "into", "what", "when", "where", "which", "their", "there", "they",
  "them", "then", "than", "been", "being", "were", "will", "would", "could",
  "should", "more", "most", "some", "such", "only", "also", "very", "here",
  "http", "https", "tco", "com", "www", "you", "are", "not", "but", "all",
  "can", "out", "one", "get", "like", "know", "really", "think", "going"
]);

export const DEFAULT_FEED_PHILOSOPHY =
  "Keep genuine human posts—whether informative, casual/funny, or a brief reply showing the other side of an opinion. Filter out engagement farming, reply-bait, rage-bait, DM funnels, and off-taste noise—even from authors I otherwise like.";

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function extractTerms(text: string, hashtags: string[] = []): string[] {
  const found = new Set<string>();
  for (const tag of hashtags) {
    const clean = tag.trim().replace(/^#+/, "").toLowerCase();
    if (clean.length >= 2) {
      found.add(`#${clean}`);
    }
  }
  const cleaned = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9_#\s]/g, " ");
  for (const token of cleaned.split(/\s+/)) {
    if (token.length >= 4 && !STOPWORDS.has(token) && !/^\d+$/.test(token)) {
      found.add(token);
      if (found.size >= 14) break;
    }
  }
  return Array.from(found);
}

export function createDefaultTasteProfile(): TasteProfile {
  return {
    philosophy: DEFAULT_FEED_PHILOSOPHY,
    learnedRules: [],
    aiJudgeEnabled: true,
    reflectCadence: "weekly",
  };
}

export function createDefaultLearnedModel(
  nowIso: string = new Date().toISOString(),
): LearnedModelParams {
  return {
    version: 1,
    trainedOnCount: 0,
    bias: 0,
    featureWeights: {},
    scorerWeights: {
      tasteJudge: 1.0,
      learnedModel: 1.0,
      authorWeights: 1.0,
      keywordRules: 1.0,
    },
    updatedAt: nowIso,
  };
}

export function ensureProfileDefaults(partial?: Partial<TuningProfile> | null): TuningProfile {
  const base = createDefaultProfile();
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    contentFilters: {
      ...base.contentFilters,
      ...(partial.contentFilters ?? {}),
    },
    thresholds: {
      ...base.thresholds,
      ...(partial.thresholds ?? {}),
    },
    uiOptions: {
      ...base.uiOptions,
      ...(partial.uiOptions ?? {}),
    },
    tasteProfile: {
      ...base.tasteProfile,
      ...(partial.tasteProfile ?? {}),
      learnedRules: Array.isArray(partial.tasteProfile?.learnedRules)
        ? partial.tasteProfile.learnedRules
        : base.tasteProfile.learnedRules,
    },
    learnedModel: {
      ...base.learnedModel,
      ...(partial.learnedModel ?? {}),
      featureWeights: {
        ...(partial.learnedModel?.featureWeights ?? {}),
      },
      embeddingHead: partial.learnedModel?.embeddingHead ?? null,
      scorerWeights: {
        ...base.learnedModel.scorerWeights,
        ...(partial.learnedModel?.scorerWeights ?? {}),
      },
    },
    storySnoozes: Array.isArray(partial.storySnoozes) ? partial.storySnoozes : [],
  };
}

export function createDefaultProfile(nowIso: string = new Date().toISOString()): TuningProfile {
  return {
    version: 1,
    revision: 1,
    updatedAt: nowIso,
    rules: [],
    authorWeights: {},
    contentFilters: {
      hidePromoted: true,
      hideReposts: false,
      hideLinksOnly: false,
      hideShortPostsBelow: 0,
    },
    thresholds: {
      hideBelow: -5,
      collapseBelow: -1.5,
      boostAbove: 2.5,
    },
    uiOptions: {
      enabled: true,
      displayMode: "collapse",
      showScoreBadge: true,
      forwardNotInterestedToX: true,
      observeNativeXFeedback: true,
      hideRightSidebar: true,
      wideTimeline: true,
      dedupeRepeatedStories: true,
    },
    tasteProfile: createDefaultTasteProfile(),
    learnedModel: createDefaultLearnedModel(nowIso),
    storySnoozes: [],
    customScorerConfig: {},
  };
}

export function createDefaultSyncConfig(): SyncConfig {
  return {
    endpointUrl: "",
    apiToken: "",
    enabled: false,
    deviceId: generateId(),
  };
}
