import {
  ensureProfileDefaults,
  generateId,
} from "../../../../packages/engine/src/defaults.ts";
import type {
  FeedbackEvent,
  SyncConfig,
  TuningProfile,
} from "../../../../packages/engine/src/types.ts";
import {
  loadExtensionStore,
  saveExtensionProfile,
  saveExtensionSyncConfig,
} from "../storage.ts";

let currentProfile: TuningProfile;
let currentFeedback: FeedbackEvent[] = [];
let currentSync: SyncConfig;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

async function commitProfile(mutator: (p: TuningProfile) => TuningProfile): Promise<void> {
  const next = mutator(currentProfile);
  currentProfile = {
    ...next,
    revision: currentProfile.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  await saveExtensionProfile(currentProfile);
  renderAll();
  void chrome.runtime.sendMessage({ type: "XFEED_SYNC_NOW" });
}

function renderRules(): void {
  const list = byId<HTMLUListElement>("rules-list");
  list.innerHTML = "";
  if (currentProfile.rules.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No keyword rules yet.";
    list.appendChild(empty);
    return;
  }

  for (const rule of currentProfile.rules) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    const cls = rule.weight >= 0 ? "badge-pos" : "badge-neg";
    const sign = rule.weight >= 0 ? "+" : "";
    left.innerHTML = `${rule.isRegex ? "/" : ""}${escapeHtml(rule.pattern)}${rule.isRegex ? "/" : ""} <span class="${cls}">(${sign}${rule.weight})</span>`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "×";
    del.addEventListener("click", () => {
      void commitProfile((p) => ({
        ...p,
        rules: p.rules.filter((r) => r.id !== rule.id),
      }));
    });

    li.append(left, del);
    list.appendChild(li);
  }
}

function renderAuthors(): void {
  const list = byId<HTMLUListElement>("authors-list");
  list.innerHTML = "";
  const entries = Object.entries(currentProfile.authorWeights).sort(
    (a, b) => a[1] - b[1],
  );
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No author adjustments yet.";
    list.appendChild(empty);
    return;
  }

  for (const [handle, weight] of entries.slice(0, 15)) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    const cls = weight >= 0 ? "badge-pos" : "badge-neg";
    const sign = weight >= 0 ? "+" : "";
    const tag = weight <= -10 ? "MUTED" : `${sign}${weight.toFixed(1)}`;
    left.innerHTML = `@${escapeHtml(handle)} <span class="${cls}">${tag}</span>`;

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "danger";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => {
      void commitProfile((p) => {
        const nextWeights = { ...p.authorWeights };
        delete nextWeights[handle];
        return { ...p, authorWeights: nextWeights };
      });
    });

    li.append(left, reset);
    list.appendChild(li);
  }
}

function renderFeedback(): void {
  const list = byId<HTMLUListElement>("feedback-list");
  list.innerHTML = "";
  if (currentFeedback.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No feedback recorded yet.";
    list.appendChild(empty);
    return;
  }

  for (const ev of currentFeedback.slice(0, 8)) {
    const li = document.createElement("li");
    const xTag = ev.syncedToX ? " · synced to X" : "";
    li.textContent = `@${ev.authorHandle} — ${ev.action} (${ev.sourceClient}${xTag})`;
    list.appendChild(li);
  }
}

function renderLearnedRules(): void {
  const list = byId<HTMLUListElement>("learned-rules-list");
  list.innerHTML = "";
  const rules = currentProfile.tasteProfile.learnedRules;
  if (rules.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Click Reflect / Learn Now after rating a few posts.";
    list.appendChild(empty);
    return;
  }
  rules.forEach((ruleText, idx) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = ruleText;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "×";
    del.addEventListener("click", () => {
      void commitProfile((p) => ({
        ...p,
        tasteProfile: {
          ...p.tasteProfile,
          learnedRules: p.tasteProfile.learnedRules.filter((_, i) => i !== idx),
        },
      }));
    });
    li.append(span, del);
    list.appendChild(li);
  });
}

function renderAll(): void {
  currentProfile = ensureProfileDefaults(currentProfile);
  byId<HTMLInputElement>("opt-enabled").checked = currentProfile.uiOptions.enabled;
  byId<HTMLSelectElement>("opt-display-mode").value = currentProfile.uiOptions.displayMode;
  byId<HTMLInputElement>("opt-hide-promoted").checked = currentProfile.contentFilters.hidePromoted;
  byId<HTMLInputElement>("opt-hide-reposts").checked = currentProfile.contentFilters.hideReposts;
  byId<HTMLInputElement>("opt-forward-x").checked = currentProfile.uiOptions.forwardNotInterestedToX;
  byId<HTMLInputElement>("opt-score-badge").checked = currentProfile.uiOptions.showScoreBadge;
  byId<HTMLInputElement>("opt-hide-sidebar").checked = currentProfile.uiOptions.hideRightSidebar;
  byId<HTMLInputElement>("opt-wide-timeline").checked = currentProfile.uiOptions.wideTimeline;
  byId<HTMLInputElement>("opt-dedupe-stories").checked = currentProfile.uiOptions.dedupeRepeatedStories;
  byId<HTMLInputElement>("opt-ai-judge").checked = currentProfile.tasteProfile.aiJudgeEnabled;
  byId<HTMLTextAreaElement>("taste-philosophy").value = currentProfile.tasteProfile.philosophy;

  byId<HTMLInputElement>("sync-url").value = currentSync.endpointUrl;
  byId<HTMLInputElement>("sync-token").value = currentSync.apiToken;
  byId<HTMLInputElement>("sync-enabled").checked = currentSync.enabled;

  renderLearnedRules();
  renderRules();
  renderAuthors();
  renderFeedback();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function initPopup(): Promise<void> {
  const store = await loadExtensionStore();
  currentProfile = store.profile;
  currentFeedback = store.feedbackHistory;
  currentSync = store.syncConfig;
  renderAll();

  const statusEl = byId<HTMLDivElement>("sync-status");
  if (store.lastSyncStatus) {
    statusEl.textContent = store.lastSyncedAt
      ? `${store.lastSyncStatus} · ${new Date(store.lastSyncedAt).toLocaleTimeString()}`
      : store.lastSyncStatus;
  }

  byId<HTMLInputElement>("opt-enabled").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void commitProfile((p) => ({
      ...p,
      uiOptions: { ...p.uiOptions, enabled: checked },
    }));
  });

  byId<HTMLSelectElement>("opt-display-mode").addEventListener("change", (e) => {
    const mode = (e.target as HTMLSelectElement).value as "collapse" | "hide";
    void commitProfile((p) => ({
      ...p,
      uiOptions: { ...p.uiOptions, displayMode: mode },
    }));
  });

  byId<HTMLInputElement>("opt-hide-promoted").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void commitProfile((p) => ({
      ...p,
      contentFilters: { ...p.contentFilters, hidePromoted: checked },
    }));
  });

  byId<HTMLInputElement>("opt-hide-reposts").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void commitProfile((p) => ({
      ...p,
      contentFilters: { ...p.contentFilters, hideReposts: checked },
    }));
  });

  byId<HTMLInputElement>("opt-forward-x").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void commitProfile((p) => ({
      ...p,
      uiOptions: { ...p.uiOptions, forwardNotInterestedToX: checked },
    }));
  });

  byId<HTMLInputElement>("opt-score-badge").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void commitProfile((p) => ({
      ...p,
      uiOptions: { ...p.uiOptions, showScoreBadge: checked },
    }));
  });

  byId<HTMLInputElement>("opt-hide-sidebar").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void commitProfile((p) => ({
      ...p,
      uiOptions: { ...p.uiOptions, hideRightSidebar: checked },
    }));
  });

  byId<HTMLInputElement>("opt-wide-timeline").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void commitProfile((p) => ({
      ...p,
      uiOptions: { ...p.uiOptions, wideTimeline: checked },
    }));
  });

  byId<HTMLInputElement>("opt-dedupe-stories").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void commitProfile((p) => ({
      ...p,
      uiOptions: { ...p.uiOptions, dedupeRepeatedStories: checked },
    }));
  });

  byId<HTMLInputElement>("opt-ai-judge").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void commitProfile((p) => ({
      ...p,
      tasteProfile: { ...p.tasteProfile, aiJudgeEnabled: checked },
    }));
  });

  byId<HTMLButtonElement>("btn-save-philosophy").addEventListener("click", () => {
    const text = byId<HTMLTextAreaElement>("taste-philosophy").value.trim();
    if (!text) return;
    void commitProfile((p) => ({
      ...p,
      tasteProfile: { ...p.tasteProfile, philosophy: text },
    }));
  });

  byId<HTMLButtonElement>("btn-reflect-now").addEventListener("click", async () => {
    const resp = (await chrome.runtime.sendMessage({
      type: "XFEED_REFLECT_TASTE",
    })) as { learnedRules?: string[] } | undefined;
    if (Array.isArray(resp?.learnedRules)) {
      await commitProfile((p) => ({
        ...p,
        tasteProfile: { ...p.tasteProfile, learnedRules: resp.learnedRules! },
      }));
    }
  });

  byId<HTMLFormElement>("rule-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const patternInput = byId<HTMLInputElement>("rule-pattern");
    const weightSelect = byId<HTMLSelectElement>("rule-weight");
    const regexCheck = byId<HTMLInputElement>("rule-regex");
    const pattern = patternInput.value.trim();
    if (!pattern) return;

    const weight = Number(weightSelect.value);
    const isRegex = regexCheck.checked;
    patternInput.value = "";
    regexCheck.checked = false;

    void commitProfile((p) => ({
      ...p,
      rules: [
        {
          id: generateId(),
          pattern,
          isRegex,
          weight,
          enabled: true,
        },
        ...p.rules,
      ],
    }));
  });

  byId<HTMLButtonElement>("btn-save-sync").addEventListener("click", async () => {
    currentSync = {
      ...currentSync,
      endpointUrl: byId<HTMLInputElement>("sync-url").value.trim(),
      apiToken: byId<HTMLInputElement>("sync-token").value.trim(),
      enabled: byId<HTMLInputElement>("sync-enabled").checked,
    };
    await saveExtensionSyncConfig(currentSync);
    statusEl.textContent = "Sync settings saved.";
  });

  byId<HTMLButtonElement>("btn-sync-now").addEventListener("click", async () => {
    currentSync = {
      ...currentSync,
      endpointUrl: byId<HTMLInputElement>("sync-url").value.trim(),
      apiToken: byId<HTMLInputElement>("sync-token").value.trim(),
      enabled: byId<HTMLInputElement>("sync-enabled").checked,
    };
    await saveExtensionSyncConfig(currentSync);
    statusEl.textContent = "Syncing...";
    const response = (await chrome.runtime.sendMessage({
      type: "XFEED_SYNC_NOW",
    })) as { ok?: boolean; status?: string } | undefined;
    statusEl.textContent = response?.status ?? "Done";
    const refreshed = await loadExtensionStore();
    currentProfile = refreshed.profile;
    currentFeedback = refreshed.feedbackHistory;
    renderAll();
  });
}

void initPopup();
