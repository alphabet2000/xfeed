import {
  CustomizationEngine,
  createDefaultProfile,
  ensureProfileDefaults,
  extractTerms,
} from "../../engine/src/index.ts";
import type {
  FeedbackAction,
  FeedbackEvent,
  JudgeVerdict,
  PostCandidate,
  SeenStoryRecord,
  TuningProfile,
} from "../../engine/src/types.ts";
import type { AdapterState, FeedStats, HostBridge } from "./bridge.ts";
import { extractPostCandidate, getFocalStatusId } from "./extractor.ts";
import {
  applyDecisionToArticle,
  applyLayoutOptions,
  hideNativeDismissedBanners,
  injectStyles,
  renderFloatingPill,
} from "./renderer.ts";
import {
  installNativeFeedbackObserver,
  triggerNativeNotInterested,
} from "./xFeedback.ts";

export class XFeedController {
  private readonly bridge: HostBridge;
  private readonly engine: CustomizationEngine;
  private profile: TuningProfile = createDefaultProfile();
  private feedbackHistory: FeedbackEvent[] = [];
  private observer: MutationObserver | null = null;
  private cleanupNativeObserver: (() => void) | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private judgeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingJudgePosts = new Map<string, PostCandidate>();
  private verdictCache = new Map<string, JudgeVerdict>();
  private judgedPostIds = new Set<string>();
  private userExpandedPostIds = new Set<string>();
  private lastTasteKey: string = "";
  private evaluatedPostActions = new Map<string, "show" | "boost" | "collapse" | "hide">();
  private seenStories = new Map<string, SeenStoryRecord>();
  private lastPathname: string = "";
  private cleanupPopstate: (() => void) | null = null;

  constructor(
    bridge: HostBridge,
    engine: CustomizationEngine = new CustomizationEngine(),
  ) {
    this.bridge = bridge;
    this.engine = engine;
  }

  getEngine(): CustomizationEngine {
    return this.engine;
  }

  getState(): AdapterState {
    return {
      profile: this.profile,
      feedbackHistory: this.feedbackHistory,
    };
  }

  private loadSeenStories(): void {
    try {
      const raw = window.localStorage?.getItem("xfeed_seen_stories_v1");
      if (!raw) return;
      const arr = JSON.parse(raw) as SeenStoryRecord[];
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const item of arr) {
        if (item?.postId && item.seenAt > cutoff && Array.isArray(item.terms)) {
          this.seenStories.set(item.postId, item);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  private persistSeenStories(): void {
    try {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const fresh = Array.from(this.seenStories.values())
        .filter((s) => s.seenAt > cutoff)
        .sort((a, b) => a.seenAt - b.seenAt)
        .slice(-300);
      this.seenStories.clear();
      for (const s of fresh) this.seenStories.set(s.postId, s);
      window.localStorage?.setItem("xfeed_seen_stories_v1", JSON.stringify(fresh));
    } catch {
      // Ignore storage errors
    }
  }

  private computeTasteKey(profile: TuningProfile): string {
    return `${profile.tasteProfile.aiJudgeEnabled}|${profile.tasteProfile.philosophy}|${profile.tasteProfile.learnedRules.join("\n")}`;
  }

  async start(): Promise<void> {
    injectStyles();
    this.loadSeenStories();
    const state = await this.bridge.loadState();
    this.profile = ensureProfileDefaults(state.profile);
    this.lastTasteKey = this.computeTasteKey(this.profile);
    this.feedbackHistory = state.feedbackHistory;

    this.bridge.onStateUpdated?.((nextState) => {
      this.profile = ensureProfileDefaults(nextState.profile);
      this.feedbackHistory = nextState.feedbackHistory;
      const nextTasteKey = this.computeTasteKey(this.profile);
      if (nextTasteKey !== this.lastTasteKey) {
        this.lastTasteKey = nextTasteKey;
        this.verdictCache.clear();
        this.judgedPostIds.clear();
      }
      this.reprocessAll(true);
    });

    this.cleanupNativeObserver = installNativeFeedbackObserver((post) => {
      if (!this.profile.uiOptions.observeNativeXFeedback) return;
      void this.handleFeedback(post, "downvote", null, true, "native_x");
    });

    this.observer = new MutationObserver(() => {
      this.scheduleScan();
    });
    if (document.body) {
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    const onRouteChange = () => {
      this.reprocessAll(true);
    };
    window.addEventListener("popstate", onRouteChange);
    this.cleanupPopstate = () => window.removeEventListener("popstate", onRouteChange);

    this.reprocessAll(true);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.cleanupNativeObserver?.();
    this.cleanupNativeObserver = null;
    this.cleanupPopstate?.();
    this.cleanupPopstate = null;
  }

  private scheduleScan(): void {
    if (this.scanTimer !== null) return;
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.reprocessAll(false);
    }, 60);
  }

  private scheduleJudgeFlush(): void {
    if (!this.bridge.judgePosts || !this.profile.tasteProfile.aiJudgeEnabled) return;
    if (this.judgeTimer !== null) return;
    this.judgeTimer = setTimeout(() => {
      this.judgeTimer = null;
      void this.flushJudgeQueue();
    }, 240);
  }

  private async flushJudgeQueue(): Promise<void> {
    if (!this.bridge.judgePosts || this.pendingJudgePosts.size === 0) return;
    const batch = Array.from(this.pendingJudgePosts.values()).slice(0, 12);
    for (const p of batch) {
      this.pendingJudgePosts.delete(p.id);
    }

    try {
      const verdicts = await this.bridge.judgePosts(
        batch,
        this.profile,
        this.feedbackHistory,
      );
      if (verdicts.length === 0) return;
      for (const verdict of verdicts) {
        this.verdictCache.set(verdict.postId, verdict);
      }
      this.reprocessAll(true);
    } catch {
      // Non-fatal: Stage 1 sync decisions remain active
    }

    if (this.pendingJudgePosts.size > 0) {
      this.scheduleJudgeFlush();
    }
  }

  private computeStats(): FeedStats {
    let hidden = 0;
    let collapsed = 0;
    let boosted = 0;
    for (const action of this.evaluatedPostActions.values()) {
      if (action === "hide") hidden += 1;
      else if (action === "collapse") collapsed += 1;
      else if (action === "boost") boosted += 1;
    }
    return {
      seen: this.evaluatedPostActions.size,
      hidden,
      collapsed,
      boosted,
    };
  }

  private updateHud(): void {
    const stats = this.computeStats();
    renderFloatingPill(stats, this.profile.uiOptions.enabled, () => {
      if (this.bridge.openTuningPanel) {
        this.bridge.openTuningPanel();
      } else {
        void this.toggleEnabled();
      }
    });
    this.bridge.reportStats?.(stats);
  }

  private async toggleEnabled(): Promise<void> {
    const updated: TuningProfile = {
      ...this.profile,
      revision: this.profile.revision + 1,
      updatedAt: new Date().toISOString(),
      uiOptions: {
        ...this.profile.uiOptions,
        enabled: !this.profile.uiOptions.enabled,
      },
    };
    this.profile = updated;
    await this.bridge.saveProfile(updated);
    this.reprocessAll(true);
  }

  private async handleFeedback(
    post: PostCandidate,
    action: FeedbackAction,
    article: HTMLElement | null,
    alreadySyncedToX: boolean = false,
    reasonTag?: string,
  ): Promise<void> {
    let syncedToX = alreadySyncedToX;
    if (
      !alreadySyncedToX &&
      (action === "downvote" || action === "farming" || action === "not_interested") &&
      article &&
      this.profile.uiOptions.forwardNotInterestedToX
    ) {
      syncedToX = await triggerNativeNotInterested(article);
    }

    if (
      action === "downvote" ||
      action === "farming" ||
      action === "not_interested" ||
      action === "seen_story" ||
      action === "less_author" ||
      action === "mute_author"
    ) {
      // If the user previously clicked "Show" on this post, un-expand it so the new filter takes effect immediately
      this.userExpandedPostIds.delete(post.id);
    }

    const result = this.engine.applyFeedback(this.profile, this.feedbackHistory, {
      post,
      action,
      reasonTag,
      syncedToX,
      sourceClient: this.bridge.clientKind,
    });
    this.profile = result.profile;
    this.feedbackHistory = result.feedbackHistory;

    await this.bridge.recordFeedback(
      result.event,
      result.profile,
      result.feedbackHistory,
    );
    this.reprocessAll(true);
  }

  reprocessAll(force: boolean): void {
    applyLayoutOptions(this.profile);
    hideNativeDismissedBanners(this.profile.uiOptions.enabled);
    const currentPath = window.location.pathname;
    if (currentPath !== this.lastPathname) {
      this.lastPathname = currentPath;
      force = true;
    }
    if (force) {
      this.evaluatedPostActions.clear();
    }
    const rev = this.profile.revision;
    const revKey = String(rev);
    const focalStatusId = getFocalStatusId();
    const articles = document.querySelectorAll<HTMLElement>(
      'article[data-testid="tweet"]',
    );

    for (const article of articles) {
      const post = extractPostCandidate(article);
      if (!post) continue;

      const verdict = this.verdictCache.get(post.id);
      const isFocalPost = Boolean(focalStatusId && post.id === focalStatusId);
      const isExpanded = isFocalPost || this.userExpandedPostIds.has(post.id);
      const renderStamp = `${revKey}:${post.id}:${verdict ? "j" : "s"}:${isExpanded ? "e" : "n"}`;
      if (!force && article.dataset.xfeedRev === renderStamp) continue;

      const ownSeen = this.seenStories.get(post.id);
      const earlierSeen =
        focalStatusId || post.sourceFeed === "post_detail"
          ? []
          : Array.from(this.seenStories.values()).filter(
              (s) => s.postId !== post.id && (!ownSeen || s.seenAt < ownSeen.seenAt),
            );

      const decision = this.engine.evaluate(
        post,
        this.profile,
        this.feedbackHistory,
        Date.now(),
        verdict,
        earlierSeen,
      );
      this.evaluatedPostActions.set(post.id, isFocalPost ? "show" : decision.action);
      article.dataset.xfeedRev = renderStamp;
      article.dataset.xfeedPostId = post.id;

      // Remember visible posts in the rolling 24h buffer so later duplicate headlines auto-collapse
      if (
        !focalStatusId &&
        !ownSeen &&
        !post.isPromoted &&
        (decision.action === "show" || decision.action === "boost")
      ) {
        const terms = extractTerms(`${post.text} ${post.quotedText ?? ""}`, post.hashtags);
        if (terms.length >= 2) {
          this.seenStories.set(post.id, {
            postId: post.id,
            authorHandle: post.authorHandle,
            terms,
            seenAt: Date.now() + this.seenStories.size,
          });
          this.persistSeenStories();
        }
      }

      applyDecisionToArticle(
        article,
        post,
        decision,
        this.profile,
        {
          onFeedback: (p, act, art, tag) => {
            void this.handleFeedback(p, act, art, false, tag);
          },
          onExpand: (expandedId) => {
            this.userExpandedPostIds.add(expandedId);
          },
        },
        isExpanded,
      );

      // Queue for Loop A AI Judge only if enabled, not yet judged, and not already filtered by Stage 1
      if (
        this.profile.uiOptions.enabled &&
        this.profile.tasteProfile.aiJudgeEnabled &&
        this.bridge.judgePosts &&
        !post.isPromoted &&
        decision.action !== "hide" &&
        decision.action !== "collapse" &&
        !verdict &&
        !this.judgedPostIds.has(post.id)
      ) {
        this.judgedPostIds.add(post.id);
        this.pendingJudgePosts.set(post.id, post);
      }
    }

    if (this.pendingJudgePosts.size > 0) {
      this.scheduleJudgeFlush();
    }

    this.updateHud();
  }
}
