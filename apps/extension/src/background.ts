import {
  distillTasteRulesLocally,
  ensureProfileDefaults,
  evaluateWithLocalRubric,
  mergeFeedback,
  mergeProfile,
  mergeSnoozes,
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
let syncQueued = false;

async function runExtensionSync(): Promise<{ ok: boolean; status: string }> {
  if (syncInFlight) {
    syncQueued = true;
    return { ok: true, status: "Sync queued" };
  }
  syncInFlight = true;
  let lastResult: { ok: boolean; status: string } = { ok: false, status: "Sync not configured" };
  try {
    do {
      syncQueued = false;
      const store = await loadExtensionStore();
      if (!store.syncConfig.enabled || !store.syncConfig.endpointUrl || !store.syncConfig.apiToken) {
        lastResult = { ok: false, status: "Sync not configured" };
        break;
      }

      const pushedIds = new Set(store.pendingFeedback.map((e) => e.id));
      const client = new SyncClient(store.syncConfig);
      const result = await client.syncAll(
        store.profile,
        store.feedbackHistory,
        store.pendingFeedback,
        store.lastSyncedAt,
      );

      if (result.ok) {
        // Re-read storage so any user clicks made while sync was in flight are NEVER overwritten!
        const latestStore = await loadExtensionStore();
        const mergedProfileBase = ensureProfileDefaults(
          mergeProfile(latestStore.profile, result.profile),
        );
        const finalProfile: TuningProfile = {
          ...mergedProfileBase,
          learnedModel: result.profile.learnedModel,
          storySnoozes: mergeSnoozes(
            latestStore.profile.storySnoozes ?? [],
            result.profile.storySnoozes ?? [],
          ),
        };
        const finalHistory = mergeFeedback(
          latestStore.feedbackHistory,
          result.feedbackHistory,
        );
        const remainingPending = latestStore.pendingFeedback.filter(
          (ev) => !pushedIds.has(ev.id),
        );
        if (
          remainingPending.length > 0 ||
          latestStore.profile.revision > store.profile.revision
        ) {
          syncQueued = true;
        }

        const status = `Synced (${result.pushedFeedbackCount}↑ / ${result.pulledFeedbackCount}↓)`;
        await saveSyncOutcome({
          profile: finalProfile,
          feedbackHistory: finalHistory,
          pendingFeedback: remainingPending,
          lastSyncedAt: result.serverTime ?? new Date().toISOString(),
          lastSyncStatus: status,
        });
        lastResult = { ok: true, status };
      } else {
        const errStatus = `Sync error: ${result.error ?? "Unknown error"}`;
        await saveSyncOutcome({ lastSyncStatus: errStatus });
        lastResult = { ok: false, status: errStatus };
        break;
      }
    } while (syncQueued);
    return lastResult;
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
