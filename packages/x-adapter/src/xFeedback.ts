import { extractPostCandidate } from "./extractor.ts";
import type { PostCandidate } from "../../engine/src/types.ts";

let syntheticMenuActiveUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findNotInterestedMenuItem(): HTMLElement | null {
  const items = document.querySelectorAll<HTMLElement>(
    '[role="menu"] [role="menuitem"], #layers [role="menuitem"]',
  );
  for (const item of items) {
    const text = (item.innerText ?? item.textContent ?? "").trim().toLowerCase();
    if (
      text.includes("not interested in this post") ||
      text.includes("not interested in this") ||
      text.includes("show less often") ||
      text === "not interested"
    ) {
      return item;
    }
  }
  return null;
}

/**
 * Programmatically clicks X's native "..." caret menu on the tweet and selects
 * "Not interested in this post" so X's own algorithm receives the exact same signal.
 */
export async function triggerNativeNotInterested(article: HTMLElement): Promise<boolean> {
  const caret = article.querySelector<HTMLElement>('[data-testid="caret"]');
  if (!caret) return false;

  syntheticMenuActiveUntil = Date.now() + 1200;
  caret.click();

  const deadline = Date.now() + 700;
  while (Date.now() < deadline) {
    await sleep(45);
    const menuItem = findNotInterestedMenuItem();
    if (menuItem) {
      syntheticMenuActiveUntil = Date.now() + 500;
      menuItem.click();
      return true;
    }
  }

  // Close the menu cleanly if "Not interested" was not present (e.g., own post)
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
  );
  return false;
}

/**
 * Watches user clicks on X's own native caret menu -> "Not interested"
 * so xfeed's Customization Engine also learns when the user interacts with native X UI.
 */
export function installNativeFeedbackObserver(
  onNativeNotInterested: (post: PostCandidate) => void,
): () => void {
  let lastCaretPost: PostCandidate | null = null;
  let lastCaretTs = 0;

  const handler = (event: MouseEvent) => {
    if (Date.now() < syntheticMenuActiveUntil) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const caret = target.closest<HTMLElement>('[data-testid="caret"]');
    if (caret) {
      const article = caret.closest<HTMLElement>('article[data-testid="tweet"]');
      if (article) {
        lastCaretPost = extractPostCandidate(article);
        lastCaretTs = Date.now();
      }
      return;
    }

    const menuItem = target.closest<HTMLElement>('[role="menuitem"]');
    if (menuItem && lastCaretPost && Date.now() - lastCaretTs < 15000) {
      const text = (menuItem.innerText ?? menuItem.textContent ?? "").trim().toLowerCase();
      if (text.includes("not interested")) {
        const post = lastCaretPost;
        lastCaretPost = null;
        onNativeNotInterested(post);
      }
    }
  };

  document.addEventListener("click", handler, true);
  return () => document.removeEventListener("click", handler, true);
}
