import {
  ensureProfileDefaults,
  extractTerms,
  generateId,
  normalizeHandle,
} from "./defaults.ts";
import { trainModelFromFeedback } from "./learner.ts";
import { createStorySnooze, pruneExpiredSnoozes } from "./novelty.ts";
import { createDefaultScorers } from "./scorers.ts";
import type {
  AsyncPostScorer,
  Decision,
  DecisionAction,
  DecisionReason,
  FeedbackEvent,
  FeedbackInput,
  JudgeVerdict,
  PostCandidate,
  PostScorer,
  ScorerResult,
  ScoringContext,
  SeenStoryRecord,
  TuningProfile,
} from "./types.ts";

const MAX_FEEDBACK_HISTORY = 2000;

function resolveDecision(
  postId: string,
  totalScore: number,
  reasons: DecisionReason[],
  hardAction: ScorerResult["hardAction"],
  profile: TuningProfile,
  now: number,
  verdict?: JudgeVerdict,
): Decision {
  const rounded = Number(totalScore.toFixed(2));
  let action: DecisionAction = "show";

  if (!profile.uiOptions.enabled) {
    return { postId, action: "show", score: rounded, reasons, verdict, evaluatedAt: now };
  }

  if (hardAction === "show") {
    action = "show";
  } else if (hardAction === "collapse_reversible") {
    action = "collapse";
  } else if (hardAction === "hide" || hardAction === "collapse") {
    action = profile.uiOptions.displayMode === "hide" ? "hide" : "collapse";
  } else if (hardAction === "boost") {
    action = "boost";
  } else if (rounded <= profile.thresholds.hideBelow) {
    action = profile.uiOptions.displayMode === "hide" ? "hide" : "collapse";
  } else if (rounded <= profile.thresholds.collapseBelow) {
    action = profile.uiOptions.displayMode === "hide" ? "hide" : "collapse";
  } else if (rounded >= profile.thresholds.boostAbove) {
    action = "boost";
  }

  return {
    postId,
    action,
    score: rounded,
    reasons,
    verdict,
    evaluatedAt: now,
  };
}

export class CustomizationEngine {
  private syncScorers: PostScorer[];
  private asyncScorers: AsyncPostScorer[];

  constructor(
    syncScorers: PostScorer[] = createDefaultScorers(),
    asyncScorers: AsyncPostScorer[] = [],
  ) {
    this.syncScorers = [...syncScorers];
    this.asyncScorers = [...asyncScorers];
  }

  registerScorer(scorer: PostScorer): void {
    this.syncScorers = [
      ...this.syncScorers.filter((s) => s.id !== scorer.id),
      scorer,
    ];
  }

  registerAsyncScorer(scorer: AsyncPostScorer): void {
    this.asyncScorers = [
      ...this.asyncScorers.filter((s) => s.id !== scorer.id),
      scorer,
    ];
  }

  removeScorer(id: string): void {
    this.syncScorers = this.syncScorers.filter((s) => s.id !== id);
    this.asyncScorers = this.asyncScorers.filter((s) => s.id !== id);
  }

  evaluate(
    post: PostCandidate,
    rawProfile: TuningProfile,
    feedbackHistory: FeedbackEvent[] = [],
    now: number = Date.now(),
    judgeVerdict?: JudgeVerdict,
    seenStories?: SeenStoryRecord[],
  ): Decision {
    const profile = ensureProfileDefaults(rawProfile);
    const ctx: ScoringContext = {
      profile,
      feedbackHistory,
      judgeVerdict,
      seenStories,
      now,
    };
    let score = 0;
    const reasons: DecisionReason[] = [];
    let hardAction: ScorerResult["hardAction"];

    for (const scorer of this.syncScorers) {
      const result = scorer.score(post, ctx);
      score += result.delta;
      if (result.reasons.length > 0) {
        reasons.push(...result.reasons);
      }
      if (result.hardAction === "show") {
        hardAction = "show";
      } else if (result.hardAction === "collapse_reversible" && hardAction !== "show") {
        hardAction = "collapse_reversible";
      } else if (
        result.hardAction === "hide" &&
        hardAction !== "show" &&
        hardAction !== "collapse_reversible"
      ) {
        hardAction = "hide";
      } else if (result.hardAction && !hardAction) {
        hardAction = result.hardAction;
      }
    }

    return resolveDecision(post.id, score, reasons, hardAction, profile, now, judgeVerdict);
  }

  async evaluateAsync(
    post: PostCandidate,
    rawProfile: TuningProfile,
    feedbackHistory: FeedbackEvent[] = [],
    now: number = Date.now(),
    judgeVerdict?: JudgeVerdict,
  ): Promise<Decision> {
    const profile = ensureProfileDefaults(rawProfile);
    const base = this.evaluate(post, profile, feedbackHistory, now, judgeVerdict);
    if (this.asyncScorers.length === 0) {
      return base;
    }

    const ctx: ScoringContext = { profile, feedbackHistory, judgeVerdict, now };
    let score = base.score;
    const reasons = [...base.reasons];
    let hardAction: ScorerResult["hardAction"] =
      base.action === "hide" ? "hide" : undefined;

    const settled = await Promise.allSettled(
      this.asyncScorers.map((s) => s.scoreAsync(post, ctx)),
    );

    for (const item of settled) {
      if (item.status !== "fulfilled") continue;
      const result = item.value;
      score += result.delta;
      if (result.reasons.length > 0) {
        reasons.push(...result.reasons);
      }
      if (result.hardAction === "show") {
        hardAction = "show";
      } else if (result.hardAction === "collapse_reversible" && hardAction !== "show") {
        hardAction = "collapse_reversible";
      } else if (
        result.hardAction === "hide" &&
        hardAction !== "show" &&
        hardAction !== "collapse_reversible"
      ) {
        hardAction = "hide";
      } else if (result.hardAction && !hardAction) {
        hardAction = result.hardAction;
      }
    }

    return resolveDecision(post.id, score, reasons, hardAction, profile, now, judgeVerdict);
  }

  applyFeedback(
    rawProfile: TuningProfile,
    feedbackHistory: FeedbackEvent[],
    input: FeedbackInput,
  ): {
    profile: TuningProfile;
    event: FeedbackEvent;
    feedbackHistory: FeedbackEvent[];
  } {
    const profile = ensureProfileDefaults(rawProfile);
    const now = input.now ?? Date.now();
    const nowIso = new Date(now).toISOString();
    const handle = normalizeHandle(input.post.authorHandle);
    const terms = extractTerms(
      `${input.post.text} ${input.post.quotedText ?? ""}`,
      input.post.hashtags,
    );

    const event: FeedbackEvent = {
      id: generateId(),
      postId: input.post.id,
      authorHandle: handle,
      action: input.action,
      reasonTag: input.reasonTag,
      syncedToX: Boolean(input.syncedToX),
      sourceClient: input.sourceClient ?? "unknown",
      createdAt: nowIso,
      postSnippet: input.post.text.slice(0, 220),
      quotedSnippet: input.post.quotedText ? input.post.quotedText.slice(0, 160) : undefined,
      terms,
    };

    const nextWeights = { ...profile.authorWeights };
    const currentWeight = nextWeights[handle] ?? 0;

    let nextSnoozes = pruneExpiredSnoozes(profile.storySnoozes, now);

    switch (input.action) {
      case "seen_story": {
        // Temporary 24h story snooze: NEVER punishes author and NEVER trains long-term taste negatively!
        const snooze = createStorySnooze(input.post, {
          hours: 24,
          sourceClient: input.sourceClient ?? "unknown",
          now,
        });
        nextSnoozes = [snooze, ...nextSnoozes].slice(0, 100);
        break;
      }
      case "downvote":
      case "farming":
        // Strictly post-level! Never punishes the author's other posts.
        break;
      case "upvote":
      case "good_post":
        // Strictly post-level positive example.
        break;
      case "false_positive":
        // Also remove any temporary snooze that matched this exact post if user restored it
        nextSnoozes = nextSnoozes.filter((s) => s.postId !== input.post.id);
        if (currentWeight < 0 && currentWeight > -10) {
          nextWeights[handle] = Number(Math.min(0, currentWeight + 0.6).toFixed(2));
        }
        break;
      case "less_author":
        nextWeights[handle] = Number(Math.max(-10, currentWeight - 5.5).toFixed(2));
        break;
      case "not_interested":
        nextWeights[handle] = Number(Math.max(-10, currentWeight - 1.2).toFixed(2));
        break;
      case "less_like_this":
        nextWeights[handle] = Number(Math.max(-10, currentWeight - 0.8).toFixed(2));
        break;
      case "more_like_this":
        nextWeights[handle] = Number(Math.min(10, currentWeight + 1.0).toFixed(2));
        break;
      case "mute_author":
        nextWeights[handle] = -10;
        break;
      case "boost_author":
        nextWeights[handle] = Number(Math.min(10, Math.max(3, currentWeight + 2.5)).toFixed(2));
        break;
      case "undo": {
        const prev = feedbackHistory.find((ev) => ev.postId === input.post.id);
        // Remove any 24h story snooze created for this post
        nextSnoozes = nextSnoozes.filter((s) => s.postId !== input.post.id);
        const setOrDeleteWeight = (val: number) => {
          const rounded = Number(val.toFixed(2));
          if (Math.abs(rounded) < 0.05) delete nextWeights[handle];
          else nextWeights[handle] = rounded;
        };
        if (prev?.action === "less_author") {
          setOrDeleteWeight(Math.min(0, currentWeight + 5.5));
        } else if (prev?.action === "mute_author") {
          delete nextWeights[handle];
        } else if (prev?.action === "not_interested") {
          setOrDeleteWeight(Math.min(0, currentWeight + 1.2));
        } else if (prev?.action === "less_like_this") {
          setOrDeleteWeight(Math.min(0, currentWeight + 0.8));
        } else if (prev?.action === "more_like_this") {
          setOrDeleteWeight(Math.max(0, currentWeight - 1.0));
        } else if (prev?.action === "boost_author") {
          setOrDeleteWeight(Math.max(0, currentWeight - 2.5));
        }
        break;
      }
    }

    const nextHistory = [event, ...feedbackHistory].slice(0, MAX_FEEDBACK_HISTORY);
    const nextLearnedModel = trainModelFromFeedback(
      nextHistory,
      profile.learnedModel.scorerWeights,
      now,
    );

    const nextProfile: TuningProfile = {
      ...profile,
      revision: profile.revision + 1,
      updatedAt: nowIso,
      authorWeights: nextWeights,
      learnedModel: nextLearnedModel,
      storySnoozes: nextSnoozes,
    };

    return {
      profile: nextProfile,
      event,
      feedbackHistory: nextHistory,
    };
  }
}
