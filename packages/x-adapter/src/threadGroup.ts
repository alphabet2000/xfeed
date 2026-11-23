import { normalizeHandle } from "../../engine/src/defaults.ts";
import type { Decision, PostCandidate } from "../../engine/src/types.ts";

export interface ThreadNodeInput {
  postId: string;
  authorHandle: string;
  containerKey: string;
  visualOrder: number;
  domIndex: number;
  connectsUp: boolean;
  connectsDown: boolean;
  replyingToHandles: string[];
  /** Vertical gap in px from previous node in same container (if measurable) */
  gapFromPrevPx?: number | null;
}

export interface ThreadMemberDecision<T> {
  item: T;
  postId: string;
  decision: Decision;
  isFocalPost: boolean;
  isUserExpanded: boolean;
}

export interface ThreadGroupResolution<T> {
  /** Whether the whole group is filtered (collapsed or hidden) as one unit */
  isFiltered: boolean;
  /** Whether the group was expanded by the user (or contains the focal post) */
  isExpanded: boolean;
  /** The representative filtered item (renders the single stub in collapse mode) */
  primaryFiltered: ThreadMemberDecision<T> | null;
  /** Total tweet count in this thread group */
  groupSize: number;
}

/**
 * Pure thread-grouping algorithm: groups visually consecutive timeline tweets
 * that belong to the same X conversation thread (connected via vertical avatar
 * thread lines, explicit "Replying to @prevAuthor" header, or previously observed peer links).
 */
export function partitionThreadGroups<T extends ThreadNodeInput>(
  nodes: T[],
  knownPeers?: Map<string, Set<string>>,
): T[][] {
  if (nodes.length === 0) return [];

  const sorted = [...nodes].sort((a, b) => {
    if (a.containerKey !== b.containerKey) {
      return a.containerKey < b.containerKey ? -1 : 1;
    }
    if (a.visualOrder !== b.visualOrder) {
      return a.visualOrder - b.visualOrder;
    }
    return a.domIndex - b.domIndex;
  });

  const groups: T[][] = [];
  let current: T[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const sameContainer = prev.containerKey === curr.containerKey;
    const prevHandle = normalizeHandle(prev.authorHandle);
    const linkedByPeers = Boolean(
      knownPeers?.get(prev.postId)?.has(curr.postId) ||
        knownPeers?.get(curr.postId)?.has(prev.postId),
    );
    const smallGap =
      curr.gapFromPrevPx == null || (curr.gapFromPrevPx >= -8 && curr.gapFromPrevPx <= 24);
    const linkedByReplyHeader =
      smallGap && curr.replyingToHandles.includes(prevHandle);
    const linkedByConnector = prev.connectsDown || curr.connectsUp;

    if (sameContainer && (linkedByConnector || linkedByReplyHeader || linkedByPeers)) {
      current.push(curr);
    } else {
      groups.push(current);
      current = [curr];
    }
  }

  groups.push(current);
  return groups;
}

/**
 * Resolves a thread group as a single feed unit:
 * - If ANY tweet in a multi-post timeline thread is filtered (hide/collapse),
 *   the entire thread is filtered together so no original/reply post is left dangling.
 * - If the user expands the stub (or any post in the group is focal), the whole thread shows.
 */
export function resolveThreadGroup<T>(
  members: ThreadMemberDecision<T>[],
): ThreadGroupResolution<T> {
  const groupSize = members.length;
  const isExpanded = members.some((m) => m.isFocalPost || m.isUserExpanded);

  if (isExpanded) {
    return {
      isFiltered: false,
      isExpanded: true,
      primaryFiltered: null,
      groupSize,
    };
  }

  const filteredMembers = members.filter(
    (m) => m.decision.action === "hide" || m.decision.action === "collapse",
  );
  if (filteredMembers.length === 0) {
    return {
      isFiltered: false,
      isExpanded: false,
      primaryFiltered: null,
      groupSize,
    };
  }

  // Pick the strongest filtered trigger (prefer hard "hide" over "collapse", then lowest score)
  const primaryFiltered = [...filteredMembers].sort((a, b) => {
    const aHide = a.decision.action === "hide" ? 1 : 0;
    const bHide = b.decision.action === "hide" ? 1 : 0;
    if (bHide !== aHide) return bHide - aHide;
    return a.decision.score - b.decision.score;
  })[0];

  return {
    isFiltered: true,
    isExpanded: false,
    primaryFiltered,
    groupSize,
  };
}

function isVerticalConnectorElement(el: HTMLElement): boolean {
  if ((el.textContent ?? "").trim().length > 0) return false;
  if (el.querySelector("img, svg, a, button, video")) return false;
  const cs = window.getComputedStyle(el);
  const bg = cs.backgroundColor;
  if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return false;
  const w = parseFloat(cs.width);
  if (!Number.isFinite(w) || w < 1 || w > 4.5) return false;
  // When visible, also verify it has vertical extent (thread bars are taller than wide)
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect.width >= 1 && rect.width <= 4.5 && rect.height >= 6;
  }
  const h = parseFloat(cs.height);
  return !Number.isFinite(h) || h >= 4 || cs.flexGrow === "1";
}

function containsVerticalConnector(root: HTMLElement): boolean {
  if (isVerticalConnectorElement(root)) return true;
  const descendants = root.querySelectorAll<HTMLElement>("div");
  for (const child of descendants) {
    if (isVerticalConnectorElement(child)) return true;
  }
  return false;
}

/**
 * Detects whether an X timeline tweet has a vertical thread connector line
 * above or below its avatar column. Caches results on dataset keyed by postId
 * so collapsing/hiding the article never loses its thread connectivity metadata.
 */
export function detectDomThreadConnectors(
  article: HTMLElement,
  post: PostCandidate,
): { connectsUp: boolean; connectsDown: boolean; replyingToHandles: string[] } {
  // Reuse cached connector metadata whenever this article still represents the same postId
  // (avoids repeated getComputedStyle / getBoundingClientRect forced reflows on every scroll mutation)
  if (article.dataset.xfeedConnPostId === post.id) {
    const cachedReply = article.dataset.xfeedReplyingTo ?? "";
    return {
      connectsUp: article.dataset.xfeedConnUp === "1",
      connectsDown: article.dataset.xfeedConnDown === "1",
      replyingToHandles: cachedReply ? cachedReply.split(",").filter(Boolean) : [],
    };
  }

  let connectsUp = false;
  let connectsDown = false;

  const avatar = article.querySelector<HTMLElement>('[data-testid="Tweet-User-Avatar"]');
  if (avatar) {
    // Walk up at most 3 levels to find the narrow avatar column containing sibling connector bars
    let branch: HTMLElement = avatar;
    let column: HTMLElement | null = avatar.parentElement;
    for (let depth = 0; depth < 3 && column && column !== article; depth++) {
      if (
        column.querySelector('[data-testid="tweetText"]') ||
        column.querySelector('[data-testid="User-Name"]')
      ) {
        break;
      }
      const children = Array.from(column.children).filter(
        (c): c is HTMLElement => c instanceof HTMLElement,
      );
      if (children.length > 1) {
        const branchIdx = children.indexOf(branch);
        if (branchIdx !== -1) {
          for (let i = 0; i < branchIdx; i++) {
            if (containsVerticalConnector(children[i])) {
              connectsUp = true;
            }
          }
          for (let i = branchIdx + 1; i < children.length; i++) {
            if (containsVerticalConnector(children[i])) {
              connectsDown = true;
            }
          }
        }
      }
      branch = column;
      column = column.parentElement;
    }
  }

  // Fallback: detect explicit "Replying to @handle" header above tweet text
  const replyingToHandles: string[] = [];
  const textEls = article.querySelectorAll<HTMLElement>("div");
  for (const el of textEls) {
    if (el.closest('[data-testid="tweetText"]')) continue;
    if (el.closest('[data-testid="User-Name"]')) continue;
    const raw = (el.textContent ?? "").trim();
    if (raw.length > 120 || !/^Replying to\b/i.test(raw)) continue;
    const links = el.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
    for (const a of links) {
      const handle = normalizeHandle((a.getAttribute("href") ?? "").replace(/^\/+/, "").split("/")[0] ?? "");
      if (handle && !replyingToHandles.includes(handle)) {
        replyingToHandles.push(handle);
      }
    }
    break;
  }

  article.dataset.xfeedConnPostId = post.id;
  article.dataset.xfeedConnUp = connectsUp ? "1" : "0";
  article.dataset.xfeedConnDown = connectsDown ? "1" : "0";
  article.dataset.xfeedReplyingTo = replyingToHandles.join(",");

  return { connectsUp, connectsDown, replyingToHandles };
}

/**
 * Extracts a stable visual vertical ordering coordinate for a virtualized X cellInnerDiv.
 */
export function getCellVisualY(cell: HTMLElement): number {
  const transform = cell.style.transform || "";
  const match = transform.match(/translate(?:Y|3d)\((?:[^,]+,\s*)?(-?\d+(?:\.\d+)?)px/);
  if (match?.[1]) {
    const val = parseFloat(match[1]);
    if (Number.isFinite(val)) return val;
  }
  const rect = cell.getBoundingClientRect();
  return rect.top + window.scrollY;
}

const THREAD_FOOTER_PHRASES = [
  "show this thread",
  "show more replies",
  "show probable spam",
];

export function isThreadFooterCell(cell: HTMLElement): boolean {
  if (cell.querySelector('article[data-testid="tweet"]')) return false;
  const text = (cell.textContent ?? "").trim().toLowerCase();
  return (
    text.length > 0 &&
    text.length <= 80 &&
    THREAD_FOOTER_PHRASES.some((p) => text.includes(p))
  );
}
