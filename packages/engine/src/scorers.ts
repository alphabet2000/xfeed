import { normalizeHandle } from "./defaults.ts";
import { verdictToScoreDelta } from "./judge.ts";
import {
  isNegativeFeedbackAction,
  isPositiveFeedbackAction,
  scoreWithLearnedModel,
} from "./learner.ts";
import { computeRepetitionPenalty, matchStorySnooze } from "./novelty.ts";
import type {
  DecisionReason,
  PostCandidate,
  PostScorer,
  ScorerResult,
  ScoringContext,
} from "./types.ts";

const EMPTY_RESULT: ScorerResult = { delta: 0, reasons: [] };

const OBVIOUS_FUNNEL_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  {
    regex: /\bcomment\s+["']?[a-z0-9_-]+["']?\s+(and\s+)?(i'?ll|we'?ll)\s+(dm|send)\b/i,
    label: "DM comment funnel",
  },
  {
    regex: /\b(like|follow)\s*,?\s*(and\s+)?(repost|retweet|rt)\b.*\b(win|giveaway|wallet|tokens)\b/i,
    label: "Giveaway engagement bait",
  },
];

export class ContentFilterScorer implements PostScorer {
  readonly id = "content-filter";

  score(post: PostCandidate, ctx: ScoringContext): ScorerResult {
    const filters = ctx.profile.contentFilters;
    const reasons: DecisionReason[] = [];
    let delta = 0;
    let hardAction: ScorerResult["hardAction"];

    if (filters.hidePromoted && post.isPromoted) {
      delta -= 10;
      hardAction = "hide";
      reasons.push({
        scorerId: this.id,
        delta: -10,
        message: "Promoted post",
      });
    }

    if (filters.hideReposts && post.isRepost) {
      delta -= 4;
      reasons.push({
        scorerId: this.id,
        delta: -4,
        message: "Repost filtered",
      });
    }

    const textWithoutUrls = post.text.replace(/https?:\/\/\S+/g, "").trim();
    if (filters.hideLinksOnly && post.links.length > 0 && textWithoutUrls.length < 12) {
      delta -= 3;
      reasons.push({
        scorerId: this.id,
        delta: -3,
        message: "Link-only post",
      });
    }

    if (
      filters.hideShortPostsBelow > 0 &&
      !post.hasMedia &&
      textWithoutUrls.length > 0 &&
      textWithoutUrls.length < filters.hideShortPostsBelow
    ) {
      delta -= 2.5;
      reasons.push({
        scorerId: this.id,
        delta: -2.5,
        message: `Shorter than ${filters.hideShortPostsBelow} chars`,
      });
    }

    for (const pat of OBVIOUS_FUNNEL_PATTERNS) {
      if (pat.regex.test(post.text)) {
        delta -= 4;
        reasons.push({
          scorerId: this.id,
          delta: -4,
          message: pat.label,
        });
        break;
      }
    }

    if (reasons.length === 0) return EMPTY_RESULT;
    return { delta, reasons, hardAction };
  }
}

export class KeywordRuleScorer implements PostScorer {
  readonly id = "keyword-rules";

  score(post: PostCandidate, ctx: ScoringContext): ScorerResult {
    const rules = ctx.profile.rules;
    if (rules.length === 0) return EMPTY_RESULT;

    const mult = ctx.profile.learnedModel?.scorerWeights?.keywordRules ?? 1.0;
    const searchable = [
      post.text,
      post.quotedText ?? "",
      post.authorHandle,
      post.authorName,
      post.hashtags.map((h) => `#${h.replace(/^#+/, "")}`).join(" "),
    ]
      .join("\n")
      .toLowerCase();

    let delta = 0;
    const reasons: DecisionReason[] = [];

    for (const rule of rules) {
      if (!rule.enabled || !rule.pattern.trim()) continue;

      let matched = false;
      if (rule.isRegex) {
        try {
          const regex = new RegExp(rule.pattern, "i");
          matched = regex.test(searchable);
        } catch {
          matched = false;
        }
      } else {
        matched = searchable.includes(rule.pattern.trim().toLowerCase());
      }

      if (matched) {
        const weighted = Number((rule.weight * mult).toFixed(2));
        delta += weighted;
        const label = rule.label?.trim() || rule.pattern;
        reasons.push({
          scorerId: this.id,
          delta: weighted,
          message:
            rule.weight >= 0
              ? `Boost rule: ${label}`
              : `Filter rule: ${label}`,
        });
      }
    }

    if (reasons.length === 0) return EMPTY_RESULT;
    return { delta, reasons };
  }
}

export class AuthorWeightScorer implements PostScorer {
  readonly id = "author-weights";

  score(post: PostCandidate, ctx: ScoringContext): ScorerResult {
    const handle = normalizeHandle(post.authorHandle);
    const rawWeight = ctx.profile.authorWeights[handle];
    if (rawWeight === undefined || rawWeight === 0) return EMPTY_RESULT;

    const mult = ctx.profile.learnedModel?.scorerWeights?.authorWeights ?? 1.0;
    const weight = Number((rawWeight * mult).toFixed(2));
    const hardAction = rawWeight <= -10 ? "hide" : undefined;
    return {
      delta: weight,
      hardAction,
      reasons: [
        {
          scorerId: this.id,
          delta: weight,
          message:
            rawWeight <= -10
              ? `Muted author @${handle}`
              : weight < 0
                ? `Less from @${handle} (${weight.toFixed(1)})`
                : `Boosted @${handle} (+${weight.toFixed(1)})`,
        },
      ],
    };
  }
}

export class TasteJudgeScorer implements PostScorer {
  readonly id = "taste-judge";

  score(_post: PostCandidate, ctx: ScoringContext): ScorerResult {
    if (!ctx.profile.tasteProfile?.aiJudgeEnabled || !ctx.judgeVerdict) {
      return EMPTY_RESULT;
    }
    const verdict = ctx.judgeVerdict;
    const mult = ctx.profile.learnedModel?.scorerWeights?.tasteJudge ?? 1.0;
    const delta = Number((verdictToScoreDelta(verdict) * mult).toFixed(2));
    const labelMap: Record<string, string> = {
      insight: "Insight",
      counterpoint: "Counterpoint",
      casual: "Casual",
      news: "News",
      farming: "Farming",
      rage_bait: "Rage-bait",
      promo: "Promo",
      low_fit: "Low fit",
      neutral: "Judge",
    };
    const prefix = labelMap[verdict.category] ?? "Judge";
    return {
      delta,
      reasons: [
        {
          scorerId: this.id,
          delta,
          message: `${prefix}: ${verdict.reason}`,
        },
      ],
    };
  }
}

/**
 * Loop C: Runs the cloud-synced online model parameters locally in <0.2ms per post.
 */
export class LearnedModelScorer implements PostScorer {
  readonly id = "learned-model";

  score(post: PostCandidate, ctx: ScoringContext): ScorerResult {
    const params = ctx.profile.learnedModel;
    if (!params || params.trainedOnCount === 0) return EMPTY_RESULT;

    const mult = params.scorerWeights?.learnedModel ?? 1.0;
    const { delta: rawDelta, topFeatures } = scoreWithLearnedModel(post, params);
    const delta = Number((rawDelta * mult).toFixed(2));
    if (Math.abs(delta) < 0.35) return EMPTY_RESULT;

    return {
      delta,
      reasons: [
        {
          scorerId: this.id,
          delta,
          message:
            delta < 0
              ? `Learned taste (${topFeatures.join(", ")})`
              : `Learned match (${topFeatures.join(", ")})`,
        },
      ],
    };
  }
}

export class FeedbackMemoryScorer implements PostScorer {
  readonly id = "feedback-memory";

  score(post: PostCandidate, ctx: ScoringContext): ScorerResult {
    if (ctx.feedbackHistory.length === 0) return EMPTY_RESULT;

    // Direct post feedback match (most recent event wins for this post)
    for (const event of ctx.feedbackHistory) {
      if (event.postId === post.id) {
        if (event.action === "false_positive") {
          return {
            delta: 0,
            hardAction: "show",
            reasons: [
              {
                scorerId: this.id,
                delta: 0,
                message: "Kept (filter corrected)",
              },
            ],
          };
        }
        if (
          isNegativeFeedbackAction(event.action) ||
          event.action === "less_author" ||
          event.action === "mute_author" ||
          event.action === "seen_story"
        ) {
          const msg =
            event.action === "less_author"
              ? `Less from @${event.authorHandle}`
              : event.action === "mute_author"
                ? `Muted @${event.authorHandle}`
                : event.action === "seen_story"
                  ? "Snoozed 24h"
                  : "Downvoted by you";
          return {
            delta: -10,
            hardAction: "hide",
            reasons: [
              {
                scorerId: this.id,
                delta: -10,
                message: msg,
              },
            ],
          };
        }
        if (isPositiveFeedbackAction(event.action)) {
          return {
            delta: 3,
            reasons: [
              {
                scorerId: this.id,
                delta: 3,
                message: "Upvoted by you",
              },
            ],
          };
        }
      }
    }

    return EMPTY_RESULT;
  }
}

/**
 * Short-term novelty & story deduplication (24h window).
 * Completely separate from long-term taste weights so repeated breaking news never poisons the learner.
 */
export class StoryNoveltyScorer implements PostScorer {
  readonly id = "story-novelty";

  score(post: PostCandidate, ctx: ScoringContext): ScorerResult {
    const snoozed = matchStorySnooze(post, ctx.profile.storySnoozes ?? [], {
      now: ctx.now,
    });
    if (snoozed) {
      return {
        delta: -6,
        hardAction: "collapse",
        reasons: [
          {
            scorerId: this.id,
            delta: -6,
            message: `Snoozed 24h (${snoozed.label})`,
          },
        ],
      };
    }

    if (ctx.profile.uiOptions.dedupeRepeatedStories && ctx.seenStories?.length) {
      const rep = computeRepetitionPenalty(post, ctx.seenStories, {
        now: ctx.now,
        judgeCategory: ctx.judgeVerdict?.category,
      });
      if (rep) {
        return {
          delta: rep.delta,
          reasons: [
            {
              scorerId: this.id,
              delta: rep.delta,
              message: rep.message,
            },
          ],
        };
      }
    }

    return EMPTY_RESULT;
  }
}

export function createDefaultScorers(): PostScorer[] {
  return [
    new ContentFilterScorer(),
    new KeywordRuleScorer(),
    new AuthorWeightScorer(),
    new StoryNoveltyScorer(),
    new TasteJudgeScorer(),
    new LearnedModelScorer(),
    new FeedbackMemoryScorer(),
  ];
}
