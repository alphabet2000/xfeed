import { XFeedController } from "../../../packages/x-adapter/src/index.ts";
import type { AdapterState, HostBridge } from "../../../packages/x-adapter/src/bridge.ts";
import type {
  FeedbackEvent,
  JudgeVerdict,
  PostCandidate,
  TuningProfile,
} from "../../../packages/engine/src/types.ts";
import {
  loadExtensionStore,
  saveExtensionFeedback,
  saveExtensionProfile,
} from "./storage.ts";

function triggerBackgroundSync(): void {
  try {
    void chrome.runtime.sendMessage({ type: "XFEED_SYNC_NOW" });
  } catch {
    // Ignore when service worker is reloading
  }
}

const extensionBridge: HostBridge = {
  clientKind: "extension",

  async loadState(): Promise<AdapterState> {
    const store = await loadExtensionStore();
    return {
      profile: store.profile,
      feedbackHistory: store.feedbackHistory,
    };
  },

  async saveProfile(profile: TuningProfile): Promise<void> {
    await saveExtensionProfile(profile);
    triggerBackgroundSync();
  },

  async recordFeedback(
    event: FeedbackEvent,
    updatedProfile: TuningProfile,
    updatedHistory: FeedbackEvent[],
  ): Promise<void> {
    await saveExtensionFeedback(event, updatedProfile, updatedHistory);
    triggerBackgroundSync();
  },

  async judgePosts(
    posts: PostCandidate[],
    profile: TuningProfile,
    feedbackHistory: FeedbackEvent[],
  ): Promise<JudgeVerdict[]> {
    try {
      const resp = (await chrome.runtime.sendMessage({
        type: "XFEED_JUDGE_POSTS",
        posts,
        profile,
        feedbackHistory: feedbackHistory.slice(0, 120),
      })) as { verdicts?: JudgeVerdict[] } | undefined;
      return Array.isArray(resp?.verdicts) ? resp.verdicts : [];
    } catch {
      return [];
    }
  },

  onStateUpdated(listener: (state: AdapterState) => void): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes["xfeed_profile"] || changes["xfeed_feedback_history"]) {
        void loadExtensionStore().then((store) => {
          listener({
            profile: store.profile,
            feedbackHistory: store.feedbackHistory,
          });
        });
      }
    });
  },
};

const controller = new XFeedController(extensionBridge);
void controller.start();
