import { createDefaultLearnedModel, extractTerms } from "./defaults.ts";
import type {
  EmbeddingHeadParams,
  FeedbackEvent,
  LearnedModelParams,
  PostCandidate,
  ScorerWeights,
} from "./types.ts";

const LEARNER_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_FEATURES = 300;

export function isPositiveFeedbackAction(action: FeedbackEvent["action"]): boolean {
  return (
    action === "upvote" ||
    action === "good_post" ||
    action === "more_like_this" ||
    action === "false_positive"
  );
}

export function isNegativeFeedbackAction(action: FeedbackEvent["action"]): boolean {
  return (
    action === "downvote" ||
    action === "farming" ||
    action === "not_interested" ||
    action === "less_like_this"
  );
}

/**
 * Extracts normalized sparse features from a post (terms + style signals).
 * Never adds length penalties against short or casual posts.
 */
export function extractPostFeatures(
  post: Pick<PostCandidate, "text" | "hashtags" | "quotedText">,
): string[] {
  const full = `${post.text} ${post.quotedText ?? ""}`.trim();
  const terms = extractTerms(full, post.hashtags);
  const features = new Set<string>(terms.map((t) => `t:${t}`));

  if (/\b(agree\?|thoughts\?|am i wrong\?|change my mind\??)\s*[👇⬇️🔥👀💯]*$/i.test(post.text)) {
    features.add("cue:reply_bait");
  }
  if (/^(unpopular opinion|hot take|harsh truth|read that again)\s*[:!\-]/i.test(post.text)) {
    features.add("cue:formulaic_opener");
  }
  if (/\b(worth noting|on the other hand|counterpoint|to be fair|actually,|depends on|the flip side)\b/i.test(post.text)) {
    features.add("cue:counterpoint");
  }
  if (/\b(measured|benchmark|postmortem|migrated|debugged|paper|latency|because)\b/i.test(full)) {
    features.add("cue:concrete_detail");
  }
  if (/\b(breaking|gossip|drama|afterparty|unbelievable)\b/i.test(full)) {
    features.add("cue:drama_hype");
  }

  return Array.from(features);
}

/**
 * Conflict-free Loop C learner: deterministically trains compact online logistic-regression
 * weights from the unified multi-device feedback log so Desktop and Android always converge
 * to the exact same learned parameters after syncing.
 */
export function trainModelFromFeedback(
  feedbackHistory: FeedbackEvent[],
  existingScorerWeights?: ScorerWeights,
  now: number = Date.now(),
): LearnedModelParams {
  const base = createDefaultLearnedModel(new Date(now).toISOString());
  const scorerWeights = existingScorerWeights ?? base.scorerWeights;

  const labeled = feedbackHistory
    .filter(
      (ev) =>
        (isPositiveFeedbackAction(ev.action) || isNegativeFeedbackAction(ev.action)) &&
        (Boolean(ev.postSnippet) || (ev.terms && ev.terms.length > 0)),
    )
    .slice(0, 600)
    .reverse(); // Chronological order for stable online updates

  if (labeled.length === 0) {
    return {
      ...base,
      scorerWeights,
    };
  }

  const weights: Record<string, number> = {};
  let bias = 0;
  const lr = 0.45;
  const l2 = 0.02;

  // Build lookup of recently upvoted posts (within 24h) so a repetition downvote on the same story
  // gets heavily down-weighted instead of poisoning long-term taste on a topic the user actually likes.
  const recentUpvotes = labeled.filter((ev) => isPositiveFeedbackAction(ev.action));
  function isLikelyRepetitionDownvote(ev: FeedbackEvent): boolean {
    if (!isNegativeFeedbackAction(ev.action)) return false;
    const evTs = Date.parse(ev.createdAt);
    const evTerms = new Set(ev.terms ?? extractTerms(ev.postSnippet ?? ""));
    if (evTerms.size < 2) return false;
    for (const pos of recentUpvotes) {
      const posTs = Date.parse(pos.createdAt);
      if (Number.isFinite(evTs) && Number.isFinite(posTs) && Math.abs(evTs - posTs) > LEARNER_DAY_MS) {
        continue;
      }
      if (ev.embedding && pos.embedding && cosineSimilarity(ev.embedding, pos.embedding) >= 0.80) {
        return true;
      }
      const posTerms = new Set(pos.terms ?? extractTerms(pos.postSnippet ?? ""));
      let shared = 0;
      for (const t of evTerms) if (posTerms.has(t)) shared += 1;
      const union = evTerms.size + posTerms.size - shared;
      if (shared >= 3 || (shared >= 2 && union > 0 && shared / union >= 0.42)) {
        return true;
      }
    }
    return false;
  }

  for (let epoch = 0; epoch < 3; epoch++) {
    for (const ev of labeled) {
      const target = isPositiveFeedbackAction(ev.action) ? 1 : 0;
      // False-positive corrections carry stronger learning weight; duplicate-story downvotes are damped
      const importance =
        ev.action === "false_positive"
          ? 1.5
          : isLikelyRepetitionDownvote(ev)
            ? 0.15
            : 1.0;

      const eventTs = Date.parse(ev.createdAt);
      const ageDays = Number.isFinite(eventTs) ? Math.max(0, (now - eventTs) / LEARNER_DAY_MS) : 0;
      const decay = Math.pow(0.5, ageDays / 30);

      const feats = extractPostFeatures({
        text: ev.postSnippet ?? (ev.terms ?? []).join(" "),
        hashtags: (ev.terms ?? []).filter((t) => t.startsWith("#")),
        quotedText: ev.quotedSnippet,
      });
      if (feats.length === 0) continue;

      let z = bias;
      for (const f of feats) {
        z += weights[f] ?? 0;
      }
      const prob = 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, z))));
      const err = (target - prob) * lr * importance * decay;

      bias = (bias + err * 0.25) * (1 - l2);
      for (const f of feats) {
        const prev = weights[f] ?? 0;
        weights[f] = prev * (1 - l2) + err / Math.sqrt(feats.length);
      }
    }
  }

  // Keep only the strongest non-trivial weights so the synced payload stays tiny (~2-6 KB)
  const prunedEntries = Object.entries(weights)
    .filter(([, w]) => Math.abs(w) >= 0.06)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, MAX_STORED_FEATURES);

  const featureWeights: Record<string, number> = {};
  for (const [k, v] of prunedEntries) {
    featureWeights[k] = Number(Math.max(-4, Math.min(4, v)).toFixed(3));
  }

  const embeddingHead = trainEmbeddingHead(feedbackHistory, { now });

  return {
    version: 1,
    trainedOnCount: labeled.length,
    bias: Number(Math.max(-1.5, Math.min(1.5, bias)).toFixed(3)),
    featureWeights,
    embeddingHead,
    scorerWeights,
    updatedAt: new Date(now).toISOString(),
  };
}

function l2Normalize(vec: number[]): number[] {
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) normSq += vec[i] * vec[i];
  const norm = Math.sqrt(normSq);
  if (norm === 0) return vec.slice();
  return vec.map((v) => v / norm);
}

/**
 * Speed 1 Online Learner on 384-dim semantic embeddings (e.g. bge-small-en-v1.5).
 * Trains time-decayed L2-regularized logistic regression directly over the synced feedback buffer
 * in <5 ms on CPU, producing a compact ~2.5 KB weight vector with zero catastrophic forgetting.
 */
export function trainEmbeddingHead(
  feedbackHistory: FeedbackEvent[],
  options: { modelId?: string; now?: number; halfLifeDays?: number; lambda?: number } = {},
): EmbeddingHeadParams | null {
  const now = options.now ?? Date.now();
  const halfLifeDays = options.halfLifeDays ?? 45;
  const lambda = options.lambda ?? 0.04;
  const modelId = options.modelId ?? "@cf/baai/bge-small-en-v1.5";

  const embedded = feedbackHistory
    .filter(
      (ev) =>
        (isPositiveFeedbackAction(ev.action) || isNegativeFeedbackAction(ev.action)) &&
        Array.isArray(ev.embedding) &&
        ev.embedding.length > 0,
    )
    .slice(0, 1000)
    .reverse();

  if (embedded.length === 0) return null;

  const dim = embedded[0].embedding!.length;
  const dataset = embedded
    .filter((ev) => ev.embedding!.length === dim)
    .map((ev) => {
      const eventTs = Date.parse(ev.createdAt);
      const ageDays = Number.isFinite(eventTs) ? Math.max(0, (now - eventTs) / LEARNER_DAY_MS) : 0;
      const decay = Math.pow(0.5, ageDays / halfLifeDays);
      const importance = ev.action === "false_positive" ? 1.8 : 1.0;
      return {
        x: l2Normalize(ev.embedding!),
        y: isPositiveFeedbackAction(ev.action) ? 1 : 0,
        weight: decay * importance,
      };
    });

  if (dataset.length === 0) return null;

  const w = new Float64Array(dim);
  let bias = 0;
  const epochs = 18;
  const lr = 0.8;

  // Full-batch L2-regularized logistic regression (convex, deterministic, converges cleanly in <5ms)
  let totalWeight = 0;
  for (const row of dataset) totalWeight += row.weight;
  if (totalWeight <= 0) return null;

  const gradW = new Float64Array(dim);
  for (let ep = 0; ep < epochs; ep++) {
    gradW.fill(0);
    let gradB = 0;

    for (const row of dataset) {
      let z = bias;
      for (let j = 0; j < dim; j++) z += w[j] * row.x[j];
      const p = 1 / (1 + Math.exp(-Math.max(-16, Math.min(16, z))));
      const diff = (p - row.y) * row.weight;
      gradB += diff;
      for (let j = 0; j < dim; j++) {
        gradW[j] += diff * row.x[j];
      }
    }

    const step = lr / Math.sqrt(1 + ep * 0.2);
    bias -= step * (gradB / totalWeight);
    for (let j = 0; j < dim; j++) {
      w[j] -= step * (gradW[j] / totalWeight + lambda * w[j]);
    }
  }

  return {
    modelId,
    dim,
    trainedOnCount: dataset.length,
    weights: Array.from(w, (v) => Number(v.toFixed(4))),
    bias: Number(Math.max(-3, Math.min(3, bias)).toFixed(4)),
    updatedAt: new Date(now).toISOString(),
  };
}

/**
 * Scores a post's embedding against the cloud-synced 384-dim logistic head (<0.1ms).
 * Returns probability p in (0,1), confidence |2p-1| in [0,1], and score delta in [-4,+4].
 */
export function scoreEmbeddingWithHead(
  embedding: number[],
  head: EmbeddingHeadParams | null | undefined,
): { prob: number; confidence: number; delta: number } | null {
  if (!head || head.trainedOnCount === 0 || embedding.length !== head.dim) {
    return null;
  }
  const x = l2Normalize(embedding);
  let z = head.bias;
  for (let i = 0; i < head.dim; i++) {
    z += head.weights[i] * x[i];
  }
  const prob = 1 / (1 + Math.exp(-Math.max(-16, Math.min(16, z))));
  const signed = prob * 2 - 1; // -1 .. +1
  const confidence = Math.abs(signed);
  const delta = Number((signed * 4.0).toFixed(2));
  return {
    prob: Number(prob.toFixed(4)),
    confidence: Number(confidence.toFixed(3)),
    delta,
  };
}

/**
 * Fast local inference (<0.2ms) using cloud-synced LearnedModelParams.
 */
export function scoreWithLearnedModel(
  post: Pick<PostCandidate, "text" | "hashtags" | "quotedText">,
  params: LearnedModelParams,
): { delta: number; topFeatures: string[] } {
  if (!params || params.trainedOnCount === 0) {
    return { delta: 0, topFeatures: [] };
  }
  const feats = extractPostFeatures(post);
  if (feats.length === 0) return { delta: 0, topFeatures: [] };

  let raw = 0;
  const matched: Array<{ feat: string; weight: number }> = [];
  for (const f of feats) {
    const w = params.featureWeights[f];
    if (w !== undefined && Math.abs(w) >= 0.08) {
      raw += w;
      matched.push({ feat: f, weight: w });
    }
  }
  if (matched.length === 0) return { delta: 0, topFeatures: [] };

  // Convert linear sum into bounded score delta (-3.5 .. +3.5)
  const scaled = Math.tanh((raw + params.bias * 0.25) * 0.9) * 3.5;
  const delta = Number(scaled.toFixed(2));
  if (Math.abs(delta) < 0.35) {
    return { delta: 0, topFeatures: [] };
  }

  matched.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const topFeatures = matched
    .slice(0, 3)
    .map((m) => m.feat.replace(/^(t:|cue:)/, ""));

  return { delta, topFeatures };
}

export function cosineSimilarity(a?: number[], b?: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
