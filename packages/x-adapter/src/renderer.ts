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

    .xfeed-hidden-cell {
      border: none !important;
    }
    .xfeed-hidden-cell > * {
      display: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      overflow: hidden !important;
    }
    .xfeed-hidden-x-feedback {
      border: none !important;
    }
    .xfeed-hidden-x-feedback > *,
    .xfeed-hidden-x-feedback .native-dismissed-banner {
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
    .xfeed-collapsed-article {
      display: none !important;
    }
    .xfeed-collapse-stub {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 14px;
      margin: 4px 10px;
      border-radius: 10px;
      background: rgba(120, 130, 145, 0.12);
      border: 1px solid rgba(120, 130, 145, 0.22);
      color: #8b98a5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.3;
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
      .xfeed-action-bar.xfeed-action-bar-cell {
        padding: 4px 12px 10px 14px !important;
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
      background: rgba(15, 20, 25, 0.9);
      color: #e7e9ea;
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      backdrop-filter: blur(8px);
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

export function hideNativeDismissedBanners(enabled: boolean): void {
  const cells = document.querySelectorAll<HTMLElement>('[data-testid="cellInnerDiv"]');
  for (const cell of cells) {
    // Only inspect non-tweet cells (X replaces the dismissed tweet with feedback/follow-up rows)
    if (cell.querySelector('article[data-testid="tweet"]')) {
      cell.classList.remove("xfeed-hidden-x-feedback");
      continue;
    }
    if (!enabled) {
      cell.classList.remove("xfeed-hidden-x-feedback");
      continue;
    }
    const text = (cell.innerText ?? cell.textContent ?? "").trim().toLowerCase();
    if (
      text.length > 0 &&
      text.length <= 280 &&
      NATIVE_FEEDBACK_PHRASES.some((phrase) => text.includes(phrase))
    ) {
      cell.classList.add("xfeed-hidden-x-feedback");
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

  if (!wide) return;

  // Clear X's obfuscated 600px max-width wrappers around & inside primaryColumn
  const primary = document.querySelector<HTMLElement>('[data-testid="primaryColumn"]');
  if (!primary) return;

  // Walk up to <main> in case an intermediate flex wrapper has a fixed width/max-width
  let parent = primary.parentElement;
  while (parent && parent.tagName !== "MAIN" && parent !== document.body) {
    const cs = window.getComputedStyle(parent);
    const mw = parseFloat(cs.maxWidth);
    const w = parseFloat(cs.width);
    if ((Number.isFinite(mw) && mw >= 550 && mw <= 650) || (Number.isFinite(w) && w >= 550 && w <= 650)) {
      parent.style.setProperty("max-width", "100%", "important");
      parent.style.setProperty("width", "100%", "important");
    }
    parent = parent.parentElement;
  }

  // Unclamp immediate layout wrappers inside primaryColumn (composer, sticky tabs, timeline)
  const descendants = primary.querySelectorAll<HTMLElement>("div");
  let checked = 0;
  for (const el of descendants) {
    if (el.closest('article[data-testid="tweet"]')) continue;
    if (el.classList.contains("xfeed-widened")) continue;
    checked += 1;
    if (checked > 80) break;
    const mw = parseFloat(window.getComputedStyle(el).maxWidth);
    if (Number.isFinite(mw) && mw >= 550 && mw <= 650) {
      el.classList.add("xfeed-widened");
    }
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

export function applyDecisionToArticle(
  article: HTMLElement,
  post: PostCandidate,
  decision: Decision,
  profile: TuningProfile,
  callbacks: RenderCallbacks,
  userExpanded: boolean,
): void {
  const cell = article.closest<HTMLElement>('[data-testid="cellInnerDiv"]') ?? article;

  // Reset previous state cleanly on both cell and article
  cell.classList.remove("xfeed-hidden-cell", "xfeed-boosted");
  article.classList.remove("xfeed-collapsed-article", "xfeed-boosted");
  cell.querySelectorAll(".xfeed-collapse-stub, .xfeed-action-bar").forEach((el) => el.remove());

  if (!profile.uiOptions.enabled) {
    return;
  }

  if (decision.action === "hide" && !userExpanded) {
    cell.classList.add("xfeed-hidden-cell");
    return;
  }

  if (decision.action === "collapse" && !userExpanded) {
    article.classList.add("xfeed-collapsed-article");
    const stub = document.createElement("div");
    stub.className = "xfeed-collapse-stub";
    const reasonText =
      decision.reasons[0]?.message ?? `Score ${decision.score.toFixed(1)}`;
    const label = document.createElement("span");
    label.textContent = `Filtered @${post.authorHandle} · ${reasonText}`;

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
      applyDecisionToArticle(article, post, decision, profile, callbacks, true);
    });

    actions.append(showBtn);
    stub.append(label, actions);
    article.parentElement?.insertBefore(stub, article);
    return;
  }

  // Attach compact decoupled feedback bar at the BOTTOM of the tweet cell (never inside horizontal flex <article>)
  const bar = document.createElement("div");
  bar.className = "xfeed-action-bar";

  const makeBtn = (
    text: string,
    title: string,
    action: FeedbackAction,
    extraClass: string = "",
    reasonTag?: string,
  ) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `xfeed-btn ${extraClass}`.trim();
    btn.textContent = text;
    btn.title = title;
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
        "✓ Keep (Wrong filter)",
        "Not an upvote — tells xfeed this post should not have been filtered",
        "false_positive",
        "xfeed-btn-keep-bar",
        "wrong_filter",
      ),
    );
  }

  bar.append(
    makeBtn(
      "👎 Downvote",
      "Downvote this post for long-term taste (farming, tone, off-taste — stays post-level without penalizing this author)",
      "downvote",
      "xfeed-btn-neg",
    ),
    makeBtn(
      "👍 Upvote",
      "Upvote this post (informative, counterpoint, casual, etc.)",
      "upvote",
      "xfeed-btn-pos",
    ),
    makeBtn(
      "🔁 Seen 24h",
      "Already saw this story — snooze similar posts for 24h without affecting your long-term taste model",
      "seen_story",
    ),
    makeBtn(
      "🔇 Less @author",
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
    const topReason = decision.reasons[0]?.message;
    badge.textContent = topReason
      ? `${sign}${decision.score.toFixed(1)} · ${topReason}`
      : `${sign}${decision.score.toFixed(1)}`;
    badge.title = badge.textContent;
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
