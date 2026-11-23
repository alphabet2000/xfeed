import {
  createDefaultProfile,
  createDefaultSyncConfig,
} from "../../../packages/engine/src/defaults.ts";
import type {
  FeedbackEvent,
  SyncConfig,
  TuningProfile,
} from "../../../packages/engine/src/types.ts";

export interface ExtensionStoreSnapshot {
  profile: TuningProfile;
  feedbackHistory: FeedbackEvent[];
  pendingFeedback: FeedbackEvent[];
  syncConfig: SyncConfig;
  lastSyncedAt?: string;
  lastSyncStatus?: string;
}

const STORAGE_KEYS = {
  profile: "xfeed_profile",
  feedbackHistory: "xfeed_feedback_history",
  pendingFeedback: "xfeed_pending_feedback",
  syncConfig: "xfeed_sync_config",
  lastSyncedAt: "xfeed_last_synced_at",
  lastSyncStatus: "xfeed_last_sync_status",
} as const;

declare const chrome: {
  storage: {
    local: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: {
      addListener(
        cb: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void,
      ): void;
    };
  };
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: {
      addListener(
        cb: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  };
  alarms: {
    create(name: string, info: { periodInMinutes: number }): void;
    onAlarm: {
      addListener(cb: (alarm: { name: string }) => void): void;
    };
  };
};

export async function loadExtensionStore(): Promise<ExtensionStoreSnapshot> {
  const raw = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const profile = (raw[STORAGE_KEYS.profile] as TuningProfile | undefined) ?? createDefaultProfile();
  const feedbackHistory = (raw[STORAGE_KEYS.feedbackHistory] as FeedbackEvent[] | undefined) ?? [];
  const pendingFeedback = (raw[STORAGE_KEYS.pendingFeedback] as FeedbackEvent[] | undefined) ?? [];
  const syncConfig =
    (raw[STORAGE_KEYS.syncConfig] as SyncConfig | undefined) ?? createDefaultSyncConfig();
  const lastSyncedAt = raw[STORAGE_KEYS.lastSyncedAt] as string | undefined;
  const lastSyncStatus = raw[STORAGE_KEYS.lastSyncStatus] as string | undefined;

  if (!raw[STORAGE_KEYS.profile] || !raw[STORAGE_KEYS.syncConfig]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.profile]: profile,
      [STORAGE_KEYS.syncConfig]: syncConfig,
    });
  }

  return {
    profile,
    feedbackHistory,
    pendingFeedback,
    syncConfig,
    lastSyncedAt,
    lastSyncStatus,
  };
}

export async function saveExtensionProfile(profile: TuningProfile): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.profile]: profile });
}

export async function saveExtensionFeedback(
  event: FeedbackEvent,
  profile: TuningProfile,
  feedbackHistory: FeedbackEvent[],
): Promise<void> {
  const raw = await chrome.storage.local.get([STORAGE_KEYS.pendingFeedback]);
  const existingPending = (raw[STORAGE_KEYS.pendingFeedback] as FeedbackEvent[] | undefined) ?? [];
  await chrome.storage.local.set({
    [STORAGE_KEYS.profile]: profile,
    [STORAGE_KEYS.feedbackHistory]: feedbackHistory,
    [STORAGE_KEYS.pendingFeedback]: [...existingPending, event].slice(-500),
  });
}

export async function saveExtensionSyncConfig(syncConfig: SyncConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.syncConfig]: syncConfig });
}

export async function saveSyncOutcome(patch: {
  profile?: TuningProfile;
  feedbackHistory?: FeedbackEvent[];
  pendingFeedback?: FeedbackEvent[];
  lastSyncedAt?: string;
  lastSyncStatus: string;
}): Promise<void> {
  const items: Record<string, unknown> = {
    [STORAGE_KEYS.lastSyncStatus]: patch.lastSyncStatus,
  };
  if (patch.profile) items[STORAGE_KEYS.profile] = patch.profile;
  if (patch.feedbackHistory) items[STORAGE_KEYS.feedbackHistory] = patch.feedbackHistory;
  if (patch.pendingFeedback) items[STORAGE_KEYS.pendingFeedback] = patch.pendingFeedback;
  if (patch.lastSyncedAt) items[STORAGE_KEYS.lastSyncedAt] = patch.lastSyncedAt;
  await chrome.storage.local.set(items);
}
