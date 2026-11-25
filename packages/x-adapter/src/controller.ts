import {
  CustomizationEngine,
  createDefaultProfile,
  ensureProfileDefaults,
  extractTerms,
  mergeFeedback,
  mergeSnoozes,
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
import { extractPostCandidate, getFocalStatusId, isAuthRoute } from "./extractor.ts";
import {
  applyDecisionToArticle,
  applyLayoutOptions,
  clearLayoutOptions,
  hideFloatingPill,
  hideNativeDismissedBanners,
  injectStyles,
  renderFloatingPill,
} from "./renderer.ts";
import {
  detectDomThreadConnectors,
  getCellVisualY,
  isThreadFooterCell,
  partitionThreadGroups,
  resolveThreadGroup,
} from "./threadGroup.ts";
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
  private persistSeenTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingJudgePosts = new Map<string, { post: PostCandidate; article: HTMLElement }>();
  private verdictCache = new Map<string, JudgeVerdict>();
  private decisionCache = new Map<string, ReturnType<CustomizationEngine["evaluate"]>>();
  private judgedPostIds = new Set<string>();
  private userExpandedPostIds = new Set<string>();
  private threadPeersByPostId = new Map<string, Set<string>>();
  private lastTasteKey: string = "";
  private lastHudKey: string = "";
  private isApplyingDom: boolean = false;
  private evaluatedPostActions = new Map<string, "show" | "boost" | "collapse" | "hide">();
  private seenStories = new Map<string, SeenStoryRecord>();
  private lastPathname: string = "";
  private cleanupPopstate: (() => void) | null = null;
  private cleanupLifecycle: (() => void) | null = null;

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

  private schedulePersistSeenStories(): void {
    if (this.persistSeenTimer !== null) return;
    this.persistSeenTimer = setTimeout(() => {
      this.persistSeenTimer = null;
      this.persistSeenStories();
    }, 5000);
  }

  private persistSeenStories(): void {
    if (this.persistSeenTimer !== null) {
      clearTimeout(this.persistSeenTimer);
      this.persistSeenTimer = null;
    }
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
      const incoming = ensureProfileDefaults(nextState.profile);
      const isStale =
        incoming.revision < this.profile.revision ||
        (incoming.revision === this.profile.revision &&
          Date.parse(incoming.updatedAt) < Date.parse(this.profile.updatedAt));
      if (isStale) {
        this.profile = {
          ...this.profile,
          storySnoozes: mergeSnoozes(
            this.profile.storySnoozes ?? [],
            incoming.storySnoozes ?? [],
          ),
        };
        this.feedbackHistory = mergeFeedback(
          this.feedbackHistory,
          nextState.feedbackHistory,
        );
      } else {
        const isExplicitReset =
          nextState.feedbackHistory.length === 0 &&
          incoming.revision > this.profile.revision &&
          Object.keys(incoming.authorWeights).length === 0 &&
          (incoming.storySnoozes?.length ?? 0) === 0;
        this.profile = incoming;
        this.feedbackHistory = isExplicitReset
          ? []
          : mergeFeedback(this.feedbackHistory, nextState.feedbackHistory);
      }
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

    this.observer = new MutationObserver((records) => {
      if (this.isApplyingDom || document.hidden) return;
      if (window.location.pathname !== this.lastPathname) {
        this.scheduleScan();
        return;
      }
      // Ignore pure text ticks (video timers, live engagement counters) and our own injected UI
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as HTMLElement;
          if (
            el.id === "xfeed-floating-pill" ||
            el.classList?.contains("xfeed-action-bar") ||
            el.classList?.contains("xfeed-collapse-stub") ||
            el.closest?.('[data-testid="app-text-transition-container"]')
          ) {
            continue;
          }
          this.scheduleScan();
          return;
        }
        for (const node of rec.removedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as HTMLElement;
          if (
            el.classList?.contains("xfeed-action-bar") ||
            el.classList?.contains("xfeed-collapse-stub") ||
            el.closest?.('[data-testid="app-text-transition-container"]')
          ) {
            continue;
          }
          this.scheduleScan();
          return;
        }
      }
    });
    if (document.body) {
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    const onRouteChange = () => {
      this.reprocessAll(true);
    };
    window.addEventListener("popstate", onRouteChange);
    this.cleanupPopstate = () => window.removeEventListener("popstate", onRouteChange);

    const onVisibilityOrHide = () => {
      if (document.hidden) {
        if (this.scanTimer !== null) {
          clearTimeout(this.scanTimer);
          this.scanTimer = null;
        }
        if (this.judgeTimer !== null) {
          clearTimeout(this.judgeTimer);
          this.judgeTimer = null;
        }
        this.persistSeenStories();
      } else {
        this.scheduleScan();
      }
    };
    const onPageHide = () => {
      this.persistSeenStories();
    };
    document.addEventListener("visibilitychange", onVisibilityOrHide);
    window.addEventListener("pagehide", onPageHide);
    this.cleanupLifecycle = () => {
      document.removeEventListener("visibilitychange", onVisibilityOrHide);
      window.removeEventListener("pagehide", onPageHide);
    };

    this.reprocessAll(true);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.cleanupNativeObserver?.();
    this.cleanupNativeObserver = null;
    this.cleanupPopstate?.();
    this.cleanupPopstate = null;
    this.cleanupLifecycle?.();
    this.cleanupLifecycle = null;
    if (this.scanTimer !== null) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.judgeTimer !== null) {
      clearTimeout(this.judgeTimer);
      this.judgeTimer = null;
    }
    this.persistSeenStories();
  }

  private scheduleScan(): void {
    if (document.hidden || this.scanTimer !== null) return;
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      if (!document.hidden) {
        this.reprocessAll(false);
      }
    }, 220);
  }

  private scheduleJudgeFlush(): void {
    if (document.hidden || !this.bridge.judgePosts || !this.profile.tasteProfile.aiJudgeEnabled) return;
    if (this.judgeTimer !== null) return;
    this.judgeTimer = setTimeout(() => {
      this.judgeTimer = null;
      void this.flushJudgeQueue();
    }, 750);
  }

  private async flushJudgeQueue(): Promise<void> {
    if (document.hidden || !this.bridge.judgePosts || this.pendingJudgePosts.size === 0) return;

    // Only judge posts still attached to the live DOM (skip posts the user already flick-scrolled past)
    const batch: PostCandidate[] = [];
    for (const [id, entry] of this.pendingJudgePosts.entries()) {
      this.pendingJudgePosts.delete(id);
      if (!entry.article.isConnected) {
        this.judgedPostIds.delete(id);
        continue;
      }
      batch.push(entry.post);
      if (batch.length >= 12) break;
    }
    if (batch.length === 0) return;

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

    if (this.pendingJudgePosts.size > 0 && !document.hidden) {
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
    const enabled = this.profile.uiOptions.enabled;
    const hudKey = `${enabled ? 1 : 0}:${stats.seen}:${stats.hidden}:${stats.collapsed}:${stats.boosted}`;
    if (hudKey === this.lastHudKey) return;
    this.lastHudKey = hudKey;
    renderFloatingPill(stats, enabled, () => {
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
      // If the user previously clicked "Show" on this post (or its thread), un-expand all posts in the thread
      this.userExpandedPostIds.delete(post.id);
      const peers = this.threadPeersByPostId.get(post.id);
      if (peers) {
        for (const peerId of peers) {
          this.userExpandedPostIds.delete(peerId);
        }
      }
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
    // Update DOM immediately (0ms feedback) before persisting & syncing in background
    this.reprocessAll(true);

    await this.bridge.recordFeedback(
      result.event,
      result.profile,
      result.feedbackHistory,
    );
    this.reprocessAll(true);
  }

  reprocessAll(force: boolean): void {
    if (document.hidden && !force) return;
    this.isApplyingDom = true;
    try {
      this.reprocessAllInner(force);
    } finally {
      this.observer?.takeRecords();
      this.isApplyingDom = false;
    }
  }

  private reprocessAllInner(force: boolean): void {
    const currentPath = window.location.pathname;
    if (currentPath !== this.lastPathname) {
      this.lastPathname = currentPath;
      force = true;
    }
    // Never touch DOM, layout, or overlay pills on X sign-in / auth flows
    if (isAuthRoute()) {
      clearLayoutOptions();
      hideFloatingPill();
      return;
    }
    injectStyles();
    applyLayoutOptions(this.profile);
    hideNativeDismissedBanners(this.profile.uiOptions.enabled);
    if (force) {
      this.evaluatedPostActions.clear();
      this.decisionCache.clear();
    }
    const rev = this.profile.revision;
    const revKey = String(rev);
    const focalStatusId = getFocalStatusId();
    const articles = Array.from(
      document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
    );

    // Assign stable IDs to parent containers so we only group cells inside the same timeline list
    const containerIds = new WeakMap<HTMLElement, string>();
    let containerSeq = 0;
    const getContainerKey = (cell: HTMLElement): string => {
      const parent = cell.parentElement;
      if (!parent) return "root";
      let id = containerIds.get(parent);
      if (!id) {
        id = `c${++containerSeq}`;
        containerIds.set(parent, id);
      }
      return id;
    };

    interface ExtractedNode {
      article: HTMLElement;
      cell: HTMLElement;
      post: PostCandidate;
      postId: string;
      authorHandle: string;
      containerKey: string;
      visualOrder: number;
      domIndex: number;
      connectsUp: boolean;
      connectsDown: boolean;
      replyingToHandles: string[];
      gapFromPrevPx: number | null;
    }

    const rawNodes: ExtractedNode[] = [];
    for (let idx = 0; idx < articles.length; idx++) {
      const article = articles[idx];
      const post = extractPostCandidate(article);
      if (!post) continue;
      const cell = article.closest<HTMLElement>('[data-testid="cellInnerDiv"]') ?? article;
      const conn = focalStatusId
        ? { connectsUp: false, connectsDown: false, replyingToHandles: [] }
        : detectDomThreadConnectors(article, post);
      rawNodes.push({
        article,
        cell,
        post,
        postId: post.id,
        authorHandle: post.authorHandle,
        containerKey: getContainerKey(cell),
        visualOrder: getCellVisualY(cell),
        domIndex: idx,
        connectsUp: conn.connectsUp,
        connectsDown: conn.connectsDown,
        replyingToHandles: conn.replyingToHandles,
        gapFromPrevPx: null,
      });
    }

    // Sort visually and only measure pixel gaps when a tweet needs the reply-header fallback
    rawNodes.sort((a, b) => {
      if (a.containerKey !== b.containerKey) return a.containerKey < b.containerKey ? -1 : 1;
      if (a.visualOrder !== b.visualOrder) return a.visualOrder - b.visualOrder;
      return a.domIndex - b.domIndex;
    });
    for (let i = 1; i < rawNodes.length; i++) {
      const prev = rawNodes[i - 1];
      const curr = rawNodes[i];
      if (
        prev.containerKey === curr.containerKey &&
        !prev.connectsDown &&
        !curr.connectsUp &&
        curr.replyingToHandles.length > 0
      ) {
        const prevRect = prev.cell.getBoundingClientRect();
        const currRect = curr.cell.getBoundingClientRect();
        if (prevRect.bottom > 0 && currRect.top > 0) {
          curr.gapFromPrevPx = currRect.top - prevRect.bottom;
        }
      }
    }

    const groups = focalStatusId
      ? rawNodes.map((n) => [n])
      : partitionThreadGroups(rawNodes, this.threadPeersByPostId);

    // Record discovered multi-post thread peer links in memory so hiding/collapsing never breaks grouping
    for (const group of groups) {
      if (group.length < 2) continue;
      const ids = group.map((n) => n.postId);
      for (const id of ids) {
        let set = this.threadPeersByPostId.get(id);
        if (!set) {
          set = new Set<string>();
          this.threadPeersByPostId.set(id, set);
        }
        for (const other of ids) {
          if (other !== id) set.add(other);
        }
      }
    }

    // Track most recent feedback action per postId so clicked buttons stay visually highlighted
    const latestActionByPostId = new Map<string, FeedbackAction>();
    for (const ev of this.feedbackHistory) {
      if (!latestActionByPostId.has(ev.postId)) {
        latestActionByPostId.set(ev.postId, ev.action);
      }
    }

    // Track filtered thread spans per container so middle "..." connectors and "Show this thread" footers also hide
    const filteredThreadSpans: Array<{
      container: HTMLElement;
      minY: number;
      maxY: number;
      nextTweetY: number | null;
    }> = [];

    for (let gIdx = 0; gIdx < groups.length; gIdx++) {
      const group = groups[gIdx];
      const evaluated = group.map((node) => {
        const verdict = this.verdictCache.get(node.postId);
        const isFocalPost = Boolean(focalStatusId && node.postId === focalStatusId);
        const ownSeen = this.seenStories.get(node.postId);
        const evalKey = `${revKey}:${node.postId}:${verdict ? "j" : "s"}`;
        let decision = this.decisionCache.get(evalKey);
        if (!decision) {
          const earlierSeen =
            focalStatusId || node.post.sourceFeed === "post_detail"
              ? []
              : Array.from(this.seenStories.values()).filter(
                  (s) => s.postId !== node.postId && (!ownSeen || s.seenAt < ownSeen.seenAt),
                );
          decision = this.engine.evaluate(
            node.post,
            this.profile,
            this.feedbackHistory,
            Date.now(),
            verdict,
            earlierSeen,
          );
          if (this.decisionCache.size > 400) {
            this.decisionCache.clear();
          }
          this.decisionCache.set(evalKey, decision);
        }
        return {
          item: node,
          postId: node.postId,
          verdict,
          ownSeen,
          decision,
          isFocalPost,
          isUserExpanded: this.userExpandedPostIds.has(node.postId),
        };
      });

      const groupRes = resolveThreadGroup(evaluated);
      const groupPostIds = group.map((n) => n.postId);
      const groupStamp =
        group.length > 1
          ? `g:${groupPostIds.join(",")}:${groupRes.isFiltered ? `f(${groupRes.primaryFiltered?.postId})` : groupRes.isExpanded ? "e" : "o"}`
          : "g1";

      if (group.length > 1 && groupRes.isFiltered && this.profile.uiOptions.enabled) {
        const parentEl = group[0].cell.parentElement;
        if (parentEl) {
          const nextGroup = groups[gIdx + 1];
          const nextTweetY =
            nextGroup && nextGroup[0].cell.parentElement === parentEl
              ? nextGroup[0].visualOrder
              : null;
          filteredThreadSpans.push({
            container: parentEl,
            minY: group[0].visualOrder,
            maxY: group[group.length - 1].visualOrder,
            nextTweetY,
          });
        }
      }

      for (const member of evaluated) {
        const { item, decision, verdict, ownSeen, isFocalPost } = member;
        const { article, cell, post } = item;
        const isCompanionHidden = Boolean(
          group.length > 1 &&
            groupRes.isFiltered &&
            groupRes.primaryFiltered &&
            groupRes.primaryFiltered.postId !== post.id,
        );
        const effectiveExpanded = groupRes.isExpanded;
        const effectiveAction = isFocalPost
          ? "show"
          : isCompanionHidden
            ? "hide"
            : decision.action;
        this.evaluatedPostActions.set(post.id, effectiveAction);

        const latestAction = latestActionByPostId.get(post.id) ?? null;
        const activeAction = latestAction === "undo" ? null : latestAction;
        const renderStamp = `${revKey}:${post.id}:${verdict ? "j" : "s"}:${effectiveExpanded ? "e" : "n"}:${activeAction ?? ""}:${groupStamp}`;
        const expected = article.dataset.xfeedExpected;
        const domIntact =
          article.dataset.xfeedRev === renderStamp &&
          ((expected === "disabled" && !this.profile.uiOptions.enabled) ||
            ((expected === "hide" || expected === "thread-hidden") &&
              cell.dataset.xfeedState === "hidden") ||
            (expected === "collapse" &&
              article.dataset.xfeedState === "collapsed" &&
              Boolean(cell.querySelector(".xfeed-collapse-stub"))) ||
            (expected === "show" &&
              cell.dataset.xfeedState !== "hidden" &&
              article.dataset.xfeedState !== "collapsed" &&
              Boolean(cell.querySelector(".xfeed-action-bar"))));

        // Remember visible posts in the rolling 24h buffer so later duplicate headlines auto-collapse
        if (
          !focalStatusId &&
          !ownSeen &&
          !post.isPromoted &&
          !groupRes.isFiltered &&
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
            this.schedulePersistSeenStories();
          }
        }

        if (force || !domIntact) {
          article.dataset.xfeedRev = renderStamp;
          article.dataset.xfeedPostId = post.id;

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
                if (groupPostIds.length > 1) {
                  for (const gid of groupPostIds) {
                    this.userExpandedPostIds.add(gid);
                  }
                  this.reprocessAll(true);
                } else {
                  this.userExpandedPostIds.add(expandedId);
                }
              },
            },
            effectiveExpanded,
            {
              threadCount: group.length > 1 ? group.length : undefined,
              hideAsThreadCompanion: isCompanionHidden,
              activeAction,
            },
          );
        }

        // Queue for Loop A AI Judge only if enabled, not yet judged, and not already filtered
        if (
          this.profile.uiOptions.enabled &&
          this.profile.tasteProfile.aiJudgeEnabled &&
          this.bridge.judgePosts &&
          !post.isPromoted &&
          !groupRes.isFiltered &&
          decision.action !== "hide" &&
          decision.action !== "collapse" &&
          !verdict &&
          !this.judgedPostIds.has(post.id)
        ) {
          this.judgedPostIds.add(post.id);
          this.pendingJudgePosts.set(post.id, { post, article });
        }
      }
    }

    // Hide dangling non-tweet thread connectors ("...") and "Show this thread" footers for filtered threads
    const auxCells = document.querySelectorAll<HTMLElement>(
      '[data-testid="cellInnerDiv"][data-xfeed-thread-aux="1"]',
    );
    for (const aux of auxCells) {
      aux.classList.remove("xfeed-hidden-cell");
      aux.removeAttribute("data-xfeed-state");
      aux.removeAttribute("data-xfeed-thread-aux");
    }
    if (filteredThreadSpans.length > 0 && this.profile.uiOptions.enabled) {
      const seenContainers = new Set(filteredThreadSpans.map((s) => s.container));
      for (const container of seenContainers) {
        const spans = filteredThreadSpans.filter((s) => s.container === container);
        const cells = Array.from(
          container.querySelectorAll<HTMLElement>(':scope > [data-testid="cellInnerDiv"]'),
        );
        for (const cell of cells) {
          if (cell.querySelector('article[data-testid="tweet"]')) continue;
          const y = getCellVisualY(cell);
          const inFilteredSpan = spans.some((span) => {
            if (y > span.minY && y < span.maxY) return true;
            if (
              isThreadFooterCell(cell) &&
              y > span.maxY &&
              (span.nextTweetY === null ? y - span.maxY <= 400 : y < span.nextTweetY)
            ) {
              return true;
            }
            return false;
          });
          if (inFilteredSpan) {
            cell.classList.add("xfeed-hidden-cell");
            cell.setAttribute("data-xfeed-state", "hidden");
            cell.setAttribute("data-xfeed-thread-aux", "1");
          }
        }
      }
    }

    if (this.pendingJudgePosts.size > 0) {
      this.scheduleJudgeFlush();
    }

    this.updateHud();
  }
}
