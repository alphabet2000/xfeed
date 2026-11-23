import { extractTerms, generateId } from "./defaults.ts";
import { cosineSimilarity } from "./learner.ts";
import type {
  ClientKind,
  JudgeCategory,
  PostCandidate,
  SeenStoryRecord,
  StorySnooze,
} from "./types.ts";

const HOUR_MS = 60 * 60 * 1000;
const SEEN_WINDOW_MS = 24 * HOUR_MS;

function termOverlapStats(
  a: string[],
  b: string[],
): { shared: number; jaccard: number; matchedTerms: string[] } {
  if (a.length === 0 || b.length === 0) {
    return { shared: 0, jaccard: 0, matchedTerms: [] };
  }
  const setA = new Set(a);
  const setB = new Set(b);
  const matchedTerms: string[] = [];
  for (const t of setA) {
    if (setB.has(t)) matchedTerms.push(t);
  }
  const shared = matchedTerms.length;
  const union = setA.size + setB.size - shared;
  return { shared, jaccard: union === 0 ? 0 : shared / union, matchedTerms };
}

export function createStorySnooze(
  post: Pick<PostCandidate, "id" | "text" | "hashtags" | "quotedText">,
  options: { hours?: number; sourceClient?: ClientKind; now?: number } = {},
): StorySnooze {
  const now = options.now ?? Date.now();
  const hours = options.hours ?? 24;
  const terms = extractTerms(`${post.text} ${post.quotedText ?? ""}`, post.hashtags);
  const label =
    terms.slice(0, 3).join(" · ") ||
    post.text.trim().slice(0, 32) ||
    `post #${post.id}`;

  return {
    id: generateId(),
    postId: post.id,
    label,
    terms,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + hours * HOUR_MS).toISOString(),
    sourceClient: options.sourceClient ?? "unknown",
  };
}

export function pruneExpiredSnoozes(
  snoozes: StorySnooze[],
  now: number = Date.now(),
): StorySnooze[] {
  return snoozes.filter((s) => {
    const exp = Date.parse(s.expiresAt);
    return Number.isFinite(exp) && exp > now;
  });
}

export function mergeSnoozes(
  local: StorySnooze[],
  remote: StorySnooze[],
  now: number = Date.now(),
): StorySnooze[] {
  const byKey = new Map<string, StorySnooze>();
  for (const s of pruneExpiredSnoozes(remote, now)) {
    byKey.set(s.id, s);
  }
  for (const s of pruneExpiredSnoozes(local, now)) {
    byKey.set(s.id, s);
  }
  return Array.from(byKey.values())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 100);
}

/**
 * Layer 2: Checks whether a post matches an active temporary 24h story snooze
 * (either by exact postId, semantic embedding cosine >= 0.78, or strong term overlap).
 */
export function matchStorySnooze(
  post: Pick<PostCandidate, "id" | "text" | "hashtags" | "quotedText">,
  snoozes: StorySnooze[],
  options: { now?: number; postEmbedding?: number[] } = {},
): StorySnooze | null {
  const now = options.now ?? Date.now();
  const active = pruneExpiredSnoozes(snoozes, now);
  if (active.length === 0) return null;

  const postTerms = extractTerms(`${post.text} ${post.quotedText ?? ""}`, post.hashtags);

  for (const snooze of active) {
    if (snooze.postId === post.id) return snooze;

    if (options.postEmbedding && snooze.embedding) {
      const cos = cosineSimilarity(options.postEmbedding, snooze.embedding);
      if (cos >= 0.78) return snooze;
    }

    const { shared, jaccard } = termOverlapStats(postTerms, snooze.terms);
    if (shared >= 3 || (shared >= 2 && jaccard >= 0.25)) {
      return snooze;
    }
  }

  return null;
}

/**
 * Layer 1: Automatic rolling 24-hour story deduplication & topic fatigue.
 * Never alters long-term learned taste weights; grants a novelty exception for genuine counterpoints.
 */
export function computeRepetitionPenalty(
  post: Pick<PostCandidate, "id" | "text" | "hashtags" | "quotedText">,
  seenStories: SeenStoryRecord[] = [],
  options: { now?: number; judgeCategory?: JudgeCategory } = {},
): { delta: number; message: string } | null {
  if (seenStories.length === 0) return null;
  const now = options.now ?? Date.now();
  const postTerms = extractTerms(`${post.text} ${post.quotedText ?? ""}`, post.hashtags);
  if (postTerms.length < 2) return null;

  let similarCount = 0;
  let maxShared = 0;
  let maxJaccard = 0;
  const termHits = new Map<string, number>();

  for (const seen of seenStories) {
    if (seen.postId === post.id) continue;
    if (now - seen.seenAt > SEEN_WINDOW_MS) continue;
    const { shared, jaccard, matchedTerms } = termOverlapStats(postTerms, seen.terms);
    if (shared >= 3 || (shared >= 2 && jaccard >= 0.30)) {
      similarCount += 1;
      if (shared > maxShared) maxShared = shared;
      if (jaccard > maxJaccard) maxJaccard = jaccard;
      for (const term of matchedTerms) {
        termHits.set(term, (termHits.get(term) ?? 0) + 1);
      }
    }
  }

  if (similarCount === 0) return null;

  // Novelty exception: if the AI Judge identifies a genuine counterpoint on the same news,
  // let the first counterpoint through without collapsing it.
  if (options.judgeCategory === "counterpoint" && similarCount <= 2) {
    return null;
  }

  const topTopics = Array.from(termHits.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const aHash = a[0].startsWith("#") ? 1 : 0;
      const bHash = b[0].startsWith("#") ? 1 : 0;
      if (bHash !== aHash) return bHash - aHash;
      return b[0].length - a[0].length;
    })
    .slice(0, 4)
    .map(([term]) => term);
  const topicSuffix = topTopics.length > 0 ? `: ${topTopics.join(", ")}` : "";

  if (maxShared >= 4 || maxJaccard >= 0.48) {
    return {
      delta: -3.5,
      message: `Already saw this story today${topicSuffix}`,
    };
  }
  if (similarCount >= 3) {
    return {
      delta: -3.0,
      message: `Repeated topic (${similarCount}× today)${topicSuffix}`,
    };
  }
  if (similarCount === 2) {
    return {
      delta: -1.8,
      message: `Repeated topic today${topicSuffix}`,
    };
  }

  return null;
}
