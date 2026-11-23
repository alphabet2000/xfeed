import { extractTerms, normalizeHandle } from "./defaults.ts";
import {
  cosineSimilarity,
  isNegativeFeedbackAction,
  isPositiveFeedbackAction,
} from "./learner.ts";
import type {
  FeedbackEvent,
  JudgeCategory,
  JudgeVerdict,
  PostCandidate,
  TuningProfile,
} from "./types.ts";

const MECHANICAL_FARMING_PATTERNS: Array<{ regex: RegExp; weight: number; label: string }> = [
  {
    regex: /\bcomment\s+["']?[a-z0-9_-]+["']?\s+(and\s+)?(i'?ll|we'?ll)\s+(dm|send)\b/i,
    weight: 4.5,
    label: "DM comment funnel",
  },
  {
    regex: /\b(like|follow)\s*,?\s*(and\s+)?(repost|retweet|rt)\b.*\b(win|giveaway|dm|free)\b/i,
    weight: 4.5,
    label: "Engagement giveaway bait",
  },
  {
    regex: /\b(agree\?|thoughts\?|am i wrong\?|change my mind\??|who else\??)\s*[👇⬇️🔥👀💯]*$/i,
    weight: 3.0,
    label: "Reply-bait closer",
  },
  {
    regex: /^(unpopular opinion|hot take|harsh truth|read that again)\s*[:!\-]/i,
    weight: 2.5,
    label: "Formulaic hot-take opener",
  },
  {
    regex: /\b(10|7|5|12)\s+(harsh truths|frameworks|habits|things|secrets)\b.*(thread|🧵|👇)/i,
    weight: 3.5,
    label: "Recycled listicle thread bait",
  },
  {
    regex: /\b(bookmark this|save this for later|you won't believe|stop doing this)\b/i,
    weight: 2.5,
    label: "Clickbait callout",
  },
];

const COUNTERPOINT_PATTERNS: RegExp[] = [
  /\b(worth noting|on the other hand|counterpoint|to be fair|actually,|not quite|depends on|the flip side|devil'?s advocate|however,)\b/i,
  /\b(breaks if|edge case|tradeoff|in practice|that assumes)\b/i,
];

const GENUINE_SUBSTANCE_PATTERNS: RegExp[] = [
  /\b(measured|benchmark|postmortem|migrated|learned|debugged|shipped|paper|latency|memory|because)\b/i,
  /\b\d+(\.\d+)?\s*(ms|x|%|gb|mb|kb|fps|hz)\b/i,
];

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Loop A: Retrieves the most relevant past feedback examples (Upvoted, Downvoted, and Kept corrections)
 * using cloud embeddings when available, falling back cleanly to lexical similarity.
 */
export function retrieveSimilarExamples(
  post: Pick<PostCandidate, "id" | "authorHandle" | "text" | "hashtags" | "quotedText">,
  feedbackHistory: FeedbackEvent[],
  maxExamples: number = 4,
  postEmbedding?: number[],
): FeedbackEvent[] {
  const postTerms = new Set(
    extractTerms(`${post.text} ${post.quotedText ?? ""}`, post.hashtags),
  );
  const postHandle = normalizeHandle(post.authorHandle);

  const scored = feedbackHistory
    .filter(
      (ev) =>
        ev.postId !== post.id &&
        (isPositiveFeedbackAction(ev.action) || isNegativeFeedbackAction(ev.action)) &&
        Boolean(ev.postSnippet),
    )
    .map((ev) => {
      const evTerms = new Set(ev.terms ?? extractTerms(ev.postSnippet ?? ""));
      const lexical = jaccardSimilarity(postTerms, evTerms);
      const semantic =
        postEmbedding && ev.embedding
          ? Math.max(0, cosineSimilarity(postEmbedding, ev.embedding))
          : 0;
      let sim = semantic > 0 ? semantic * 0.75 + lexical * 0.25 : lexical;
      if (normalizeHandle(ev.authorHandle) === postHandle) {
        sim += 0.12;
      }
      if (ev.action === "false_positive") {
        sim += 0.2;
      }
      return { ev, sim };
    })
    .sort((a, b) => b.sim - a.sim);

  const picked: FeedbackEvent[] = [];
  const usedIds = new Set<string>();
  for (const item of scored) {
    if (picked.length >= maxExamples) break;
    if (item.sim > 0.05 || picked.length < 2) {
      picked.push(item.ev);
      usedIds.add(item.ev.id);
    }
  }

  const hasPos = picked.some((e) => isPositiveFeedbackAction(e.action));
  const hasNeg = picked.some((e) => isNegativeFeedbackAction(e.action));
  if (!hasPos) {
    const pos = feedbackHistory.find(
      (e) => !usedIds.has(e.id) && isPositiveFeedbackAction(e.action),
    );
    if (pos) picked.push(pos);
  }
  if (!hasNeg) {
    const neg = feedbackHistory.find(
      (e) => !usedIds.has(e.id) && isNegativeFeedbackAction(e.action),
    );
    if (neg) picked.push(neg);
  }

  return picked.slice(0, maxExamples);
}

/**
 * Local deterministic fallback & dev-mode Taste Judge.
 */
export function evaluateWithLocalRubric(
  post: PostCandidate,
  profile: TuningProfile,
  feedbackHistory: FeedbackEvent[],
  nowIso: string = new Date().toISOString(),
  postEmbedding?: number[],
): JudgeVerdict {
  const similar = retrieveSimilarExamples(post, feedbackHistory, 4, postEmbedding);
  const fullText = `${post.text}\n${post.quotedText ?? ""}`.trim();

  let farming = 1.5;
  let worthwhile = 5.5;
  let category: JudgeCategory = "neutral";
  let reason = "Genuine post";

  for (const pat of MECHANICAL_FARMING_PATTERNS) {
    if (pat.regex.test(post.text)) {
      farming += pat.weight;
      worthwhile -= 1.8;
      category = "farming";
      reason = pat.label;
    }
  }

  const letters = post.text.replace(/[^A-Za-z]/g, "");
  const upperLetters = post.text.replace(/[^A-Z]/g, "");
  if (letters.length >= 20 && upperLetters.length / letters.length > 0.45) {
    farming += 2.0;
    worthwhile -= 1.0;
    if (category === "neutral") {
      category = "rage_bait";
      reason = "ALL-CAPS hype / bait";
    }
  }

  if (post.isPromoted) {
    farming = Math.max(farming, 9.0);
    worthwhile = Math.min(worthwhile, 1.0);
    category = "promo";
    reason = "Promoted ad";
  }

  const hasCounterpoint = COUNTERPOINT_PATTERNS.some((re) => re.test(post.text));
  if (hasCounterpoint && farming < 4.5) {
    worthwhile += 2.6;
    farming = Math.max(0.5, farming - 0.8);
    category = "counterpoint";
    reason = post.isQuote
      ? "Adds counterpoint to quoted post"
      : "Shows another side of the issue";
  }

  const hasSubstance = GENUINE_SUBSTANCE_PATTERNS.some((re) => re.test(fullText));
  if (hasSubstance && farming < 4.5) {
    worthwhile += 2.2;
    farming = Math.max(0.5, farming - 0.8);
    if (category === "neutral") {
      category = "insight";
      reason = "Concrete experience or detail";
    }
  }

  // Genuine casual / human observation stays cleanly visible ("show") without triggering boost highlight
  if (category === "neutral" && farming <= 2.0 && post.text.trim().length > 0) {
    category = "casual";
    worthwhile = Math.min(worthwhile, 4.5);
    reason = "Authentic casual post";
  }

  const postTerms = new Set(extractTerms(fullText, post.hashtags));
  for (const ex of similar) {
    const exTerms = new Set(ex.terms ?? extractTerms(ex.postSnippet ?? ""));
    const lexical = jaccardSimilarity(postTerms, exTerms);
    const semantic =
      postEmbedding && ex.embedding
        ? Math.max(0, cosineSimilarity(postEmbedding, ex.embedding))
        : 0;
    const sim = semantic > 0 ? semantic : lexical;
    if (sim < 0.14) continue;

    if (isNegativeFeedbackAction(ex.action)) {
      farming += 2.8 * Math.min(1, sim * 2.5);
      worthwhile -= 1.8 * Math.min(1, sim * 2.5);
      if (farming >= 5.5) {
        category = category === "farming" ? "farming" : "low_fit";
        reason = "Similar to downvoted posts";
      }
    } else if (ex.action === "false_positive") {
      farming = Math.max(0.5, farming - 3.5 * Math.min(1, sim * 2.5));
      worthwhile += 2.8 * Math.min(1, sim * 2.5);
      reason = "Kept via your past correction";
    } else if (isPositiveFeedbackAction(ex.action)) {
      worthwhile += 2.2 * Math.min(1, sim * 2.5);
      farming = Math.max(0.5, farming - 1.2 * Math.min(1, sim * 2.5));
      if (category === "neutral" || category === "casual") {
        reason = "Matches posts you upvoted";
      }
    }
  }

  for (const ruleText of profile.tasteProfile?.learnedRules ?? []) {
    const lower = ruleText.toLowerCase();
    if (lower.includes("counterpoint") && hasCounterpoint) {
      worthwhile += 0.6;
    }
  }

  const clampedWorthwhile = Number(Math.max(0, Math.min(10, worthwhile)).toFixed(1));
  const clampedFarming = Number(Math.max(0, Math.min(10, farming)).toFixed(1));

  return {
    postId: post.id,
    worthwhile: clampedWorthwhile,
    farming: clampedFarming,
    category,
    reason,
    similarExampleIds: similar.map((e) => e.id),
    source: "local-rubric",
    evaluatedAt: nowIso,
  };
}

/**
 * Loop B local distiller: summarizes recent Upvote, Downvote, and Keep-correction feedback
 * into editable human-readable taste rules.
 */
export function distillTasteRulesLocally(
  feedbackHistory: FeedbackEvent[],
  existingRules: string[] = [],
): string[] {
  const rules = new Set<string>(existingRules);
  const negativeEvents = feedbackHistory.filter((e) => isNegativeFeedbackAction(e.action));
  const positiveEvents = feedbackHistory.filter((e) => isPositiveFeedbackAction(e.action));
  const corrections = feedbackHistory.filter((e) => e.action === "false_positive");

  if (negativeEvents.length > 0) {
    if (negativeEvents.some((e) => /\?|agree|thoughts|unpopular opinion|hot take/i.test(e.postSnippet ?? ""))) {
      rules.add("Filter reply-bait and formulaic hot-take posts, even from followed authors.");
    }
    if (negativeEvents.some((e) => /breaking|unbelievable|outrage|drama|gossip/i.test(e.postSnippet ?? ""))) {
      rules.add("Filter manufactured outrage, gossip, and rage-bait posts.");
    }
    if (negativeEvents.some((e) => /giveaway|dm|thread|10\s+/i.test(e.postSnippet ?? ""))) {
      rules.add("Filter DM funnels, giveaways, and recycled listicle threads.");
    }
    if (rules.size === existingRules.length) {
      const topTerms = negativeEvents
        .flatMap((e) => e.terms ?? [])
        .slice(0, 3);
      if (topTerms.length > 0) {
        rules.add(`Downrank off-taste posts similar to downvoted themes (${topTerms.join(", ")}).`);
      }
    }
  }

  if (positiveEvents.length > 0) {
    if (positiveEvents.some((e) => e.reasonTag === "counterpoint" || /worth noting|other side|depends|actually/i.test(e.postSnippet ?? ""))) {
      rules.add("Keep brief replies and quote-posts that offer a genuine counterpoint or the other side of an opinion.");
    }
    if (positiveEvents.some((e) => e.reasonTag === "casual" || /semicolon|dns|funny/i.test(e.postSnippet ?? ""))) {
      rules.add("Keep authentic casual observations and dry humor without requiring links or long explanations.");
    }
    if (positiveEvents.some((e) => e.reasonTag === "insight" || /benchmark|paper|measured|migrated|memory/i.test(e.postSnippet ?? ""))) {
      rules.add("Boost first-hand technical insights, measurements, and primary sources.");
    }
  }

  if (corrections.length > 0) {
    rules.add(`Avoid over-filtering posts similar to ${corrections.length} recent user-restored post(s).`);
  }

  return Array.from(rules).slice(0, 12);
}

export function verdictToScoreDelta(verdict: JudgeVerdict): number {
  if (verdict.farming >= 6.5) {
    return Number((-((verdict.farming - 4.0) * 0.95)).toFixed(2));
  }
  const net = (verdict.worthwhile - verdict.farming) * 0.55;
  return Number(Math.max(-5, Math.min(4.5, net)).toFixed(2));
}

export function buildJudgeSystemPrompt(profile: TuningProfile): string {
  const learned =
    profile.tasteProfile.learnedRules.length > 0
      ? `\nDistilled user taste rules:\n${profile.tasteProfile.learnedRules.map((r) => `- ${r}`).join("\n")}`
      : "";
  return `You are a personal X feed taste judge. Separate content the user finds genuinely worthwhile (informative insight, brief counterpoints showing another side, authentic casual posts or humor) from content they dislike (engagement farming, reply-bait, rage-bait, DM funnels, recycled platitudes, or off-taste noise).
NEVER penalize a post just for being short, casual, or lacking links/stats. Judge each post independently—the same author can post both great posts and posts the user wants filtered.

User's Feed Philosophy:
${profile.tasteProfile.philosophy}${learned}

Return ONLY valid JSON: {"verdicts":[{"postId":"...","worthwhile":0-10,"farming":0-10,"category":"insight|counterpoint|casual|news|farming|rage_bait|promo|low_fit|neutral","reason":"3-8 word explanation"}]}`;
}
