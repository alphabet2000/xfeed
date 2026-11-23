import {
  distillTasteRulesLocally,
  ensureProfileDefaults,
  evaluateWithLocalRubric,
} from "../../../packages/engine/src/index.ts";
import { SyncClient } from "../../../packages/engine/src/sync.ts";
import type {
  FeedbackEvent,
  PostCandidate,
  TuningProfile,
} from "../../../packages/engine/src/types.ts";
import { loadExtensionStore, saveSyncOutcome } from "./storage.ts";

const SYNC_ALARM_NAME = "xfeed_periodic_sync";
let syncInFlight = false;

async function runExtensionSync(): Promise<{ ok: boolean; status: string }> {
  if (syncInFlight) return { ok: false, status: "Sync already running" };
  syncInFlight = true;
  try {
    const store = await loadExtensionStore();
    if (!store.syncConfig.enabled || !store.syncConfig.endpointUrl || !store.syncConfig.apiToken) {
      return { ok: false, status: "Sync not configured" };
    }

    const client = new SyncClient(store.syncConfig);
    const result = await client.syncAll(
      store.profile,
      store.feedbackHistory,
      store.pendingFeedback,
      store.lastSyncedAt,
    );

    if (result.ok) {
      const status = `Synced (${result.pushedFeedbackCount}↑ / ${result.pulledFeedbackCount}↓)`;
      await saveSyncOutcome({
        profile: result.profile,
        feedbackHistory: result.feedbackHistory,
        pendingFeedback: [],
        lastSyncedAt: result.serverTime ?? new Date().toISOString(),
        lastSyncStatus: status,
      });
      return { ok: true, status };
    }

    const errStatus = `Sync error: ${result.error ?? "Unknown error"}`;
    await saveSyncOutcome({ lastSyncStatus: errStatus });
    return { ok: false, status: errStatus };
  } finally {
    syncInFlight = false;
  }
}

async function runJudgeBatch(
  posts: PostCandidate[],
  profileInput: TuningProfile,
  feedbackHistory: FeedbackEvent[],
) {
  const store = await loadExtensionStore();
  const profile = ensureProfileDefaults(profileInput ?? store.profile);
  const history = feedbackHistory ?? store.feedbackHistory;

  if (store.syncConfig.enabled && store.syncConfig.endpointUrl && store.syncConfig.apiToken) {
    try {
      const client = new SyncClient(store.syncConfig);
      const verdicts = await client.judgePosts(posts, profile, history);
      return { verdicts };
    } catch {
      // Fall through to local rubric fallback
    }
  }
  return {
    verdicts: posts.map((p) => evaluateWithLocalRubric(p, profile, history)),
  };
}

async function runReflectTaste() {
  const store = await loadExtensionStore();
  const profile = ensureProfileDefaults(store.profile);
  if (store.syncConfig.enabled && store.syncConfig.endpointUrl && store.syncConfig.apiToken) {
    try {
      const client = new SyncClient(store.syncConfig);
      return await client.reflectTaste(profile, store.feedbackHistory);
    } catch {
      // Fall through to local distiller
    }
  }
  return {
    learnedRules: distillTasteRulesLocally(
      store.feedbackHistory,
      profile.tasteProfile.learnedRules,
    ),
    source: "local-distiller",
  };
}

chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    void runExtensionSync();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as {
    type?: string;
    posts?: PostCandidate[];
    profile?: TuningProfile;
    feedbackHistory?: FeedbackEvent[];
  } | null;

  if (msg?.type === "XFEED_SYNC_NOW") {
    void runExtensionSync().then((res) => sendResponse(res));
    return true;
  }
  if (msg?.type === "XFEED_JUDGE_POSTS") {
    void runJudgeBatch(
      msg.posts ?? [],
      msg.profile as TuningProfile,
      msg.feedbackHistory ?? [],
    ).then((res) => sendResponse(res));
    return true;
  }
  if (msg?.type === "XFEED_REFLECT_TASTE") {
    void runReflectTaste().then((res) => sendResponse(res));
    return true;
  }
  return false;
});
