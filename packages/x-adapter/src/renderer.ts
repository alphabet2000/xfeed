import type {
  Decision,
  FeedbackAction,
  PostCandidate,
  TuningProfile,
} from "../../engine/src/types.ts";
import type { FeedStats } from "./bridge.ts";

const STYLE_ID = "xfeed-injected-styles";
const PILL_ID = "xfeed-floating-pill";

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Desktop x.com layout cleanup: remove right sidebar & widen middle feed column */
    body.xfeed-hide-sidebar [data-testid="sidebarColumn"] {
      display: none !important;
    }
    @media (min-width: 700px) {
      body.xfeed-wide-timeline header[role="banner"] {
        flex-grow: 0.25 !important;
      }
      body.xfeed-wide-timeline main[role="main"] {
        flex-grow: 1 !important;
        align-items: flex-start !important;
      }
      body.xfeed-wide-timeline main[role="main"] > div {
        width: 100% !important;
        max-width: 960px !important;
        flex: 1 1 auto !important;
      }
      body.xfeed-wide-timeline main[role="main"] > div > div {
        width: 100% !important;
        max-width: 100% !important;
        justify-content: flex-start !important;
      }
      body.xfeed-wide-timeline [data-testid="primaryColumn"] {
        max-width: 900px !important;
        width: 100% !important;
        flex: 1 1 auto !important;
      }
      body.xfeed-wide-timeline [data-testid="primaryColumn"] > div,
      body.xfeed-wide-timeline [data-testid="primaryColumn"] > div > div,
      body.xfeed-wide-timeline [data-testid="primaryColumn"] section,
      body.xfeed-wide-timeline [data-testid="primaryColumn"] [aria-label^="Timeline"] {
        max-width: 100% !important;
        width: 100% !important;
      }
      body.xfeed-wide-timeline [data-testid="primaryColumn"] .xfeed-widened {
        max-width: 100% !important;
        width: 100% !important;
      }
      body.xfeed-wide-timeline [data-testid="primaryColumn"] article[data-testid="tweet"] {
        max-width: 100% !important;
      }
      /* Keep embedded photos, videos, and link cards at X's native ~520px width so screenshots don't blow up */
      body.xfeed-wide-timeline article[data-testid="tweet"] [data-testid="card.wrapper"],
      body.xfeed-wide-timeline article[data-testid="tweet"] [data-testid="videoPlayer"],
      body.xfeed-wide-timeline article[data-testid="tweet"] div:has([data-testid="tweetPhoto"]):not(:has([role="group"])):not(:has([data-testid="tweetText"])):not(:has([data-testid="User-Name"])),
      body.xfeed-wide-timeline article[data-testid="tweet"] div:has([data-testid="videoPlayer"]):not(:has([role="group"])):not(:has([data-testid="tweetText"])):not(:has([data-testid="User-Name"])) {
        max-width: 520px !important;
      }
    }

    .xfeed-hidden-cell,
    [data-xfeed-state="hidden"],
    body [data-testid="cellInnerDiv"][data-xfeed-state="hidden"] {
      border: none !important;
    }
    .xfeed-hidden-cell > *,
    [data-xfeed-state="hidden"] > *,
    body [data-testid="cellInnerDiv"][data-xfeed-state="hidden"] > *,
    body article[data-testid="tweet"][data-xfeed-state="hidden"] {
      display: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      overflow: hidden !important;
    }
    .xfeed-hidden-x-feedback,
    [data-xfeed-native-hidden="1"] {
      border: none !important;
    }
    .xfeed-hidden-x-feedback > *,
    .xfeed-hidden-x-feedback .native-dismissed-banner,
    [data-xfeed-native-hidden="1"] > *,
    [data-xfeed-native-hidden="1"] .native-dismissed-banner {
      display: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      overflow: hidden !important;
    }
    .native-dismissed-banner {
      display: none !important;
    }
    .xfeed-collapsed-article,
    article[data-xfeed-state="collapsed"],
    body article[data-testid="tweet"][data-xfeed-state="collapsed"] {
      display: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }
    .xfeed-collapse-stub {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 14px;
      margin: 4px 10px;
      border-radius: 10px;
      background: rgba(120, 130, 145, 0.12);
      border: 1px solid rgba(120, 130, 145, 0.22);
      color: #8b98a5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.35;
    }
    .xfeed-stub-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .xfeed-stub-reason {
      color: #c5ced6;
      font-weight: 500;
    }
    .xfeed-stub-preview {
      color: #71767b;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .xfeed-stub-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .xfeed-collapse-stub button {
      background: transparent;
      border: 1px solid rgba(120, 130, 145, 0.35);
      color: #1d9bf0;
      border-radius: 999px;
      padding: 2px 9px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .xfeed-btn-keep-bar {
      color: #00ba7c;
      border-color: rgba(0, 186, 124, 0.48);
      background: rgba(0, 186, 124, 0.12);
      font-weight: 600;
    }
    .xfeed-btn-keep-bar:hover {
      background: rgba(0, 186, 124, 0.24);
      border-color: rgba(0, 186, 124, 0.7);
    }

    /* Placed directly under the post's reply/repost/like bar inside the vertical tweet column */
    .xfeed-action-bar {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      width: 100% !important;
      box-sizing: border-box !important;
      padding: 6px 0 4px 0 !important;
      margin-top: 2px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      color: #8b98a5;
      opacity: 0.88;
    }
    .xfeed-action-bar.xfeed-action-bar-cell {
      padding: 4px 16px 10px 68px !important;
    }
    @media (max-width: 600px) {
      .xfeed-action-bar {
        flex-wrap: nowrap !important;
        gap: 10px !important;
        padding: 6px 0 4px 0 !important;
      }
      .xfeed-action-bar.xfeed-action-bar-cell {
        padding: 4px 12px 10px 14px !important;
      }
      .xfeed-btn {
        padding: 4px 10px !important;
        font-size: 14px !important;
        line-height: 1.25 !important;
      }
      .xfeed-btn .xfeed-btn-lbl {
        display: none !important;
      }
      .xfeed-btn-keep-bar {
        font-size: 12px !important;
        padding: 4px 9px !important;
      }
      .xfeed-btn-keep-bar .xfeed-btn-lbl-short {
        display: inline !important;
      }
      .xfeed-btn-keep-bar .xfeed-btn-lbl-long {
        display: none !important;
      }
      .xfeed-score-pill {
        max-width: 96px !important;
        min-width: 0 !important;
        flex-shrink: 1 !important;
      }
    }
    .xfeed-action-bar:hover {
      opacity: 1;
    }
    .xfeed-btn {
      background: rgba(120, 130, 145, 0.14);
      border: 1px solid rgba(120, 130, 145, 0.25);
      color: #e7e9ea;
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 11px;
      cursor: pointer;
      line-height: 1.35;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .xfeed-btn:hover {
      background: rgba(29, 155, 240, 0.18);
      border-color: rgba(29, 155, 240, 0.45);
    }
    .xfeed-btn-pos:hover {
      background: rgba(0, 186, 124, 0.18);
      border-color: rgba(0, 186, 124, 0.45);
    }
    .xfeed-btn-neg:hover {
      background: rgba(244, 33, 46, 0.18);
      border-color: rgba(244, 33, 46, 0.45);
    }
    .xfeed-score-pill {
      margin-left: auto;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      background: rgba(120, 130, 145, 0.16);
      color: #8b98a5;
      white-space: nowrap;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .xfeed-score-pill.pos {
      background: rgba(0, 186, 124, 0.18);
      color: #00ba7c;
    }
    .xfeed-score-pill.neg {
      background: rgba(244, 33, 46, 0.18);
      color: #f4212e;
    }
    #${PILL_ID} {
      position: fixed;
      right: 14px;
      bottom: 72px;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(15, 20, 25, 0.94);
      color: #e7e9ea;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

const NATIVE_FEEDBACK_PHRASES = [
  "thanks. x will use this to make your timeline better",
  "thanks. x will show fewer posts",
  "thanks. refreshing this page will update your timeline",
  "show fewer posts from ",
  "see fewer posts from ",
  "see fewer posts like this",
  "this post isn't relevant",
  "this post is spam",
  "this post is repetitive",
  "i'm not interested in this",
  "post hidden",
];

const checkedLayoutEls = new WeakSet<HTMLElement>();

export function hideNativeDismissedBanners(enabled: boolean): void {
  const cells = document.querySelectorAll<HTMLElement>('[data-testid="cellInnerDiv"]');
  for (const cell of cells) {
    // Only inspect non-tweet cells (X replaces the dismissed tweet with feedback/follow-up rows)
    if (cell.querySelector('article[data-testid="tweet"]')) {
      if (cell.dataset.xfeedNativeHidden === "1") {
        cell.classList.remove("xfeed-hidden-x-feedback");
        cell.removeAttribute("data-xfeed-native-hidden");
      }
      continue;
    }
    if (!enabled) {
      if (cell.dataset.xfeedNativeHidden === "1") {
        cell.classList.remove("xfeed-hidden-x-feedback");
        cell.removeAttribute("data-xfeed-native-hidden");
      }
      continue;
    }
    const raw = cell.textContent ?? "";
    const text = raw.trim().toLowerCase();
    if (
      text.length > 0 &&
      text.length <= 280 &&
      NATIVE_FEEDBACK_PHRASES.some((phrase) => text.includes(phrase))
    ) {
      if (cell.dataset.xfeedNativeHidden !== "1") {
        cell.classList.add("xfeed-hidden-x-feedback");
        cell.setAttribute("data-xfeed-native-hidden", "1");
      }
    }
  }
}

export function applyLayoutOptions(profile: TuningProfile): void {
  if (!document.body) return;
  const active = Boolean(profile.uiOptions.enabled);
  const hideSidebar = active && Boolean(profile.uiOptions.hideRightSidebar);
  const wide = active && Boolean(profile.uiOptions.wideTimeline);

  document.body.classList.toggle("xfeed-hide-sidebar", hideSidebar);
  document.body.classList.toggle("xfeed-wide-timeline", wide);

  // Skip expensive desktop column unclamping on mobile viewports (< 700px) where @media doesn't apply
  if (!wide || window.innerWidth < 700) return;

  // Clear X's obfuscated 600px max-width wrappers around & inside primaryColumn
  const primary = document.querySelector<HTMLElement>('[data-testid="primaryColumn"]');
  if (!primary) return;

  // Walk up to <main> in case an intermediate flex wrapper has a fixed width/max-width
  let parent = primary.parentElement;
  while (parent && parent.tagName !== "MAIN" && parent !== document.body) {
    if (!checkedLayoutEls.has(parent)) {
      checkedLayoutEls.add(parent);
      const cs = window.getComputedStyle(parent);
      const mw = parseFloat(cs.maxWidth);
      const w = parseFloat(cs.width);
      if ((Number.isFinite(mw) && mw >= 550 && mw <= 650) || (Number.isFinite(w) && w >= 550 && w <= 650)) {
        parent.style.setProperty("max-width", "100%", "important");
        parent.style.setProperty("width", "100%", "important");
      }
    }
    parent = parent.parentElement;
  }

  // Unclamp immediate layout wrappers inside primaryColumn (composer, sticky tabs, timeline)
  const descendants = primary.querySelectorAll<HTMLElement>("div");
  let checked = 0;
  for (const el of descendants) {
    if (checkedLayoutEls.has(el) || el.classList.contains("xfeed-widened")) continue;
    if (el.closest('article[data-testid="tweet"]')) continue;
    checkedLayoutEls.add(el);
    checked += 1;
    if (checked > 40) break;
    const mw = parseFloat(window.getComputedStyle(el).maxWidth);
    if (Number.isFinite(mw) && mw >= 550 && mw <= 650) {
      el.classList.add("xfeed-widened");
    }
  }
}

export function clearLayoutOptions(): void {
  if (!document.body) return;
  document.body.classList.remove("xfeed-hide-sidebar", "xfeed-wide-timeline");
}

export function hideFloatingPill(): void {
  const pill = document.getElementById(PILL_ID);
  if (pill) {
    pill.style.display = "none";
  }
}

export function renderFloatingPill(
  stats: FeedStats,
  enabled: boolean,
  onClick: () => void,
): void {
  let pill = document.getElementById(PILL_ID);
  if (!pill) {
    pill = document.createElement("button");
    pill.id = PILL_ID;
    pill.type = "button";
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    document.body?.appendChild(pill);
  }
  pill.style.display = "flex";
  const filtered = stats.hidden + stats.collapsed;
  pill.textContent = enabled
    ? `xfeed · ${filtered} filtered`
    : "xfeed · paused";
}

export interface RenderCallbacks {
  onFeedback: (
    post: PostCandidate,
    action: FeedbackAction,
    article: HTMLElement,
    reasonTag?: string,
  ) => void;
  onExpand: (postId: string) => void;
}

export interface RenderArticleOptions {
  threadCount?: number;
  hideAsThreadCompanion?: boolean;
}

export function applyDecisionToArticle(
  article: HTMLElement,
  post: PostCandidate,
  decision: Decision,
  profile: TuningProfile,
  callbacks: RenderCallbacks,
  userExpanded: boolean,
  options?: RenderArticleOptions,
): void {
  const cell = article.closest<HTMLElement>('[data-testid="cellInnerDiv"]') ?? article;

  // Reset previous state cleanly on both cell and article
  cell.classList.remove("xfeed-hidden-cell", "xfeed-boosted");
  cell.removeAttribute("data-xfeed-state");
  article.classList.remove("xfeed-collapsed-article", "xfeed-boosted");
  article.removeAttribute("data-xfeed-state");
  article.style.removeProperty("display");
  cell.querySelectorAll(".xfeed-collapse-stub, .xfeed-action-bar").forEach((el) => el.remove());

  if (!profile.uiOptions.enabled) {
    article.dataset.xfeedExpected = "disabled";
    return;
  }

  if (options?.hideAsThreadCompanion && !userExpanded) {
    cell.classList.add("xfeed-hidden-cell");
    cell.setAttribute("data-xfeed-state", "hidden");
    article.style.setProperty("display", "none", "important");
    article.dataset.xfeedExpected = "thread-hidden";
    return;
  }

  if (decision.action === "hide" && !userExpanded) {
    cell.classList.add("xfeed-hidden-cell");
    cell.setAttribute("data-xfeed-state", "hidden");
    article.style.setProperty("display", "none", "important");
    article.dataset.xfeedExpected = "hide";
    return;
  }

  if (decision.action === "collapse" && !userExpanded) {
    article.classList.add("xfeed-collapsed-article");
    article.setAttribute("data-xfeed-state", "collapsed");
    article.style.setProperty("display", "none", "important");
    article.dataset.xfeedExpected = "collapse";
    const stub = document.createElement("div");
    stub.className = "xfeed-collapse-stub";
    const negativeReasons = [...decision.reasons]
      .filter((r) => r.delta < 0)
      .sort((a, b) => a.delta - b.delta);
    const chosenReasons = (
      negativeReasons.length > 0 ? negativeReasons : decision.reasons
    ).slice(0, 2);
    const uniqueMessages: string[] = [];
    for (const r of chosenReasons) {
      if (r.message && !uniqueMessages.includes(r.message)) {
        uniqueMessages.push(r.message);
      }
    }
    const reasonText =
      uniqueMessages.length > 0
        ? uniqueMessages.join(" · ")
        : `Score ${decision.score.toFixed(1)}`;
    const scoreTag = `${decision.score > 0 ? "+" : ""}${decision.score.toFixed(1)}`;
    const threadPrefix =
      options?.threadCount && options.threadCount > 1
        ? `Filtered thread (${options.threadCount} posts) · `
        : "Filtered ";

    const body = document.createElement("div");
    body.className = "xfeed-stub-body";

    const label = document.createElement("span");
    label.className = "xfeed-stub-reason";
    label.textContent = `${threadPrefix}@${post.authorHandle} (${scoreTag}) · ${reasonText}`;
    body.append(label);

    const previewSource = (post.text || post.quotedText || "").replace(/\s+/g, " ").trim();
    if (previewSource) {
      const preview = document.createElement("span");
      preview.className = "xfeed-stub-preview";
      preview.textContent =
        previewSource.length > 110
          ? `"${previewSource.slice(0, 107)}…"`
          : `"${previewSource}"`;
      preview.title = previewSource;
      body.append(preview);
    }

    const actions = document.createElement("span");
    actions.className = "xfeed-stub-actions";

    const showBtn = document.createElement("button");
    showBtn.type = "button";
    showBtn.textContent = "Show";
    showBtn.title = "Reveal this filtered post to inspect it";
    showBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onExpand(post.id);
      if (!options?.threadCount || options.threadCount <= 1) {
        applyDecisionToArticle(article, post, decision, profile, callbacks, true);
      }
    });

    actions.append(showBtn);
    stub.append(body, actions);
    article.parentElement?.insertBefore(stub, article);
    return;
  }

  // Attach compact decoupled feedback bar at the BOTTOM of the tweet cell (never inside horizontal flex <article>)
  article.dataset.xfeedExpected = "show";
  const bar = document.createElement("div");
  bar.className = "xfeed-action-bar";

  const makeBtn = (
    icon: string,
    label: string,
    title: string,
    action: FeedbackAction,
    extraClass: string = "",
    reasonTag?: string,
    longSuffix?: string,
  ) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `xfeed-btn ${extraClass}`.trim();
    btn.setAttribute("aria-label", longSuffix ? `${label} ${longSuffix}` : label);
    btn.title = title;

    const icoSpan = document.createElement("span");
    icoSpan.className = "xfeed-btn-ico";
    icoSpan.textContent = icon;
    btn.append(icoSpan);

    const lblSpan = document.createElement("span");
    lblSpan.className = longSuffix ? "xfeed-btn-lbl xfeed-btn-lbl-short" : "xfeed-btn-lbl";
    lblSpan.textContent = ` ${label}`;
    btn.append(lblSpan);

    if (longSuffix) {
      const longSpan = document.createElement("span");
      longSpan.className = "xfeed-btn-lbl xfeed-btn-lbl-long";
      longSpan.textContent = ` ${longSuffix}`;
      btn.append(longSpan);
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onFeedback(post, action, article, reasonTag);
    });
    return btn;
  };

  if (userExpanded && (decision.action === "collapse" || decision.action === "hide")) {
    bar.append(
      makeBtn(
        "✓",
        "Keep",
        "Not an upvote — tells xfeed this post should not have been filtered",
        "false_positive",
        "xfeed-btn-keep-bar",
        "wrong_filter",
        "(Wrong filter)",
      ),
    );
  }

  bar.append(
    makeBtn(
      "👎",
      "Downvote",
      "Downvote this post for long-term taste (farming, tone, off-taste — stays post-level without penalizing this author)",
      "downvote",
      "xfeed-btn-neg",
    ),
    makeBtn(
      "👍",
      "Upvote",
      "Upvote this post (informative, counterpoint, casual, etc.)",
      "upvote",
      "xfeed-btn-pos",
    ),
    makeBtn(
      "🔁",
      "Seen 24h",
      "Already saw this story — snooze similar posts for 24h without affecting your long-term taste model",
      "seen_story",
    ),
    makeBtn(
      "🔇",
      "Less @author",
      "Show less from this author overall",
      "less_author",
      "xfeed-btn-neg",
    ),
  );

  if (profile.uiOptions.showScoreBadge) {
    const badge = document.createElement("span");
    const cls = decision.score > 0 ? "pos" : decision.score < 0 ? "neg" : "";
    badge.className = `xfeed-score-pill ${cls}`.trim();
    const sign = decision.score > 0 ? "+" : "";
    const sortedReasons = [...decision.reasons].sort(
      (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
    );
    const topReason = sortedReasons[0]?.message;
    badge.textContent = topReason
      ? `${sign}${decision.score.toFixed(1)} · ${topReason}`
      : `${sign}${decision.score.toFixed(1)}`;
    badge.title =
      sortedReasons.length > 0
        ? `${sign}${decision.score.toFixed(1)} · ${sortedReasons.map((r) => `${r.message} (${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)})`).join(" | ")}`
        : badge.textContent;
    bar.append(badge);
  }

  // Mount directly UNDER the post's reply/repost/like [role="group"] toolbar so it stays inside
  // X's vertical column & virtualizer height measurement (never to the right of <article>).
  const actionGroups = article.querySelectorAll<HTMLElement>('[role="group"]');
  const bottomGroup = actionGroups.length > 0 ? actionGroups[actionGroups.length - 1] : null;
  if (bottomGroup && bottomGroup.parentElement) {
    bottomGroup.insertAdjacentElement("afterend", bar);
  } else if (cell !== article) {
    bar.classList.add("xfeed-action-bar-cell");
    cell.appendChild(bar);
  } else {
    bar.classList.add("xfeed-action-bar-cell");
    article.insertAdjacentElement("afterend", bar);
  }
}
