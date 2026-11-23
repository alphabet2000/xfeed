import { normalizeHandle } from "../../engine/src/defaults.ts";
import type { PostCandidate, SourceFeed } from "../../engine/src/types.ts";

export function getFocalStatusId(loc: Location = window.location): string | null {
  const match = loc.pathname.match(/^\/[^/]+\/status\/(\d+)/i);
  return match?.[1] ?? null;
}

export function isAuthRoute(loc: Location = window.location): boolean {
  const pathname = loc.pathname.toLowerCase();
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/i/flow/login") ||
    pathname.startsWith("/i/flow/signup") ||
    pathname.startsWith("/i/flow/password_reset") ||
    pathname.startsWith("/i/oauth2") ||
    pathname.startsWith("/account/access") ||
    pathname === "/logout"
  );
}

export function detectSourceFeed(loc: Location = window.location): SourceFeed {
  const pathname = loc.pathname.toLowerCase();
  if (pathname === "/home" || pathname === "/") {
    const selectedTab = document.querySelector<HTMLElement>(
      '[role="tablist"] [role="tab"][aria-selected="true"]',
    );
    const label = (selectedTab?.innerText ?? "").trim().toLowerCase();
    if (label.includes("following")) return "following";
    return "for_you";
  }
  if (/^\/[^/]+\/status\/\d+/i.test(pathname)) return "post_detail";
  if (pathname.startsWith("/search") || pathname.startsWith("/hashtag/")) return "search";
  if (pathname.includes("/lists/")) return "list";
  if (/^\/[a-z0-9_]+(\/|$)/i.test(pathname)) return "profile";
  return "other";
}

function extractStatusId(article: HTMLElement): string | null {
  const timeLink = article.querySelector<HTMLAnchorElement>('a[href*="/status/"] time')?.closest("a");
  const candidateLinks: HTMLAnchorElement[] = [];
  if (timeLink) candidateLinks.push(timeLink);
  article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]').forEach((a) => {
    candidateLinks.push(a);
  });

  for (const link of candidateLinks) {
    const match = link.getAttribute("href")?.match(/\/status\/(\d+)/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractAuthor(article: HTMLElement): { handle: string; name: string } {
  const userNameBlock = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
  if (userNameBlock) {
    const links = Array.from(userNameBlock.querySelectorAll<HTMLAnchorElement>("a[href^='/']"));
    let handle = "";
    let name = "";
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      const text = (link.innerText ?? "").trim();
      if (!handle && /^\/[A-Za-z0-9_]+$/.test(href)) {
        handle = normalizeHandle(href.slice(1));
      }
      if (!name && text && !text.startsWith("@")) {
        name = text;
      }
    }
    if (handle) return { handle, name: name || handle };
  }

  const statusHref = article
    .querySelector<HTMLAnchorElement>('a[href*="/status/"]')
    ?.getAttribute("href");
  const fallbackMatch = statusHref?.match(/^\/([A-Za-z0-9_]+)\/status\//);
  const handle = fallbackMatch?.[1] ? normalizeHandle(fallbackMatch[1]) : "unknown";
  return { handle, name: handle };
}

function detectPromoted(article: HTMLElement): boolean {
  // Note: X reuses [data-testid="placementTracking"] on regular GIF/video players,
  // so only treat a post as promoted when an explicit Ad / Promoted badge is present.
  const spans = article.querySelectorAll<HTMLSpanElement>("span");
  for (const span of spans) {
    if (span.closest('[data-testid="tweetText"]')) continue;
    if (span.closest('[data-testid="User-Name"]')) continue;
    const text = (span.textContent ?? "").trim();
    if (text === "Ad" || text === "Promoted" || text.startsWith("Promoted by ")) {
      return true;
    }
  }
  return false;
}

export function extractPostCandidate(article: HTMLElement): PostCandidate | null {
  const id = extractStatusId(article);
  const isPromoted = detectPromoted(article);

  // Promoted cards sometimes omit a /status/<id> link; synthesize a stable key from text + author.
  const author = extractAuthor(article);
  const textNodes = Array.from(
    article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'),
  );
  const mainText = (textNodes[0]?.innerText ?? "").trim();
  const quotedText = textNodes.length > 1 ? (textNodes[1]?.innerText ?? "").trim() : undefined;

  const finalId =
    id ??
    (isPromoted
      ? `ad:${author.handle}:${mainText.slice(0, 32)}`
      : null);
  if (!finalId) return null;

  const socialContext = (
    article.querySelector<HTMLElement>('[data-testid="socialContext"]')?.innerText ?? ""
  ).trim();
  const isRepost = /reposted|retweeted/i.test(socialContext);
  const repostedBy = isRepost
    ? socialContext.replace(/\s*(reposted|retweeted).*$/i, "").trim()
    : undefined;

  const hashtags: string[] = [];
  article.querySelectorAll<HTMLAnchorElement>('a[href^="/hashtag/"]').forEach((a) => {
    const tag = (a.innerText ?? "").replace(/^#/, "").trim();
    if (tag) hashtags.push(tag);
  });

  const links: string[] = [];
  article.querySelectorAll<HTMLAnchorElement>('a[href^="https://"], a[href^="http://"]').forEach((a) => {
    const href = a.href;
    if (href && !href.startsWith("https://x.com/") && !href.startsWith("https://twitter.com/")) {
      links.push(href);
    }
  });

  const hasMedia = Boolean(
    article.querySelector('[data-testid="tweetPhoto"], [data-testid="card.wrapper"], video'),
  );
  const hasVideo = Boolean(article.querySelector('video, [data-testid="videoPlayer"]'));
  const timestamp =
    article.querySelector<HTMLTimeElement>("time")?.getAttribute("datetime") ?? undefined;

  return {
    id: finalId,
    authorHandle: author.handle,
    authorName: author.name,
    text: mainText,
    isRepost,
    repostedBy,
    isQuote: Boolean(quotedText),
    quotedText,
    isPromoted,
    hasMedia,
    hasVideo,
    links,
    hashtags,
    sourceFeed: detectSourceFeed(),
    timestamp,
  };
}
