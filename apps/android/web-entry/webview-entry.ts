import {
  createDefaultProfile,
  ensureProfileDefaults,
} from "../../../packages/engine/src/defaults.ts";
import { XFeedController } from "../../../packages/x-adapter/src/index.ts";
import type {
  AdapterState,
  FeedStats,
  HostBridge,
} from "../../../packages/x-adapter/src/bridge.ts";
import type {
  FeedbackEvent,
  JudgeVerdict,
  PostCandidate,
  TuningProfile,
} from "../../../packages/engine/src/types.ts";

interface AndroidNativeBridge {
  getStateJson(): string;
  saveProfileJson(profileJson: string): void;
  recordFeedbackJson(
    eventJson: string,
    profileJson: string,
    historyJson: string,
  ): void;
  requestJudgeBatch?(
    requestId: string,
    postsJson: string,
    profileJson: string,
    historyJson: string,
  ): void;
  openTuningPanel(): void;
  reportStatsJson(statsJson: string): void;
}

declare global {
  interface Window {
    XFeedAndroid?: AndroidNativeBridge;
    __xfeedInitialized?: boolean;
    __xfeedPushState?: (stateJson: string) => void;
    __xfeedResolveJudge?: (requestId: string, verdictsJson: string) => void;
  }
}

function parseAdapterState(raw: string): AdapterState {
  try {
    const parsed = JSON.parse(raw) as Partial<AdapterState>;
    return {
      profile: ensureProfileDefaults(parsed.profile ?? createDefaultProfile()),
      feedbackHistory: Array.isArray(parsed.feedbackHistory)
        ? parsed.feedbackHistory
        : [],
    };
  } catch {
    return {
      profile: createDefaultProfile(),
      feedbackHistory: [],
    };
  }
}

if (!window.__xfeedInitialized) {
  window.__xfeedInitialized = true;

  let stateListener: ((state: AdapterState) => void) | null = null;
  let judgeSeq = 0;
  const pendingJudgeResolvers = new Map<string, (verdicts: JudgeVerdict[]) => void>();

  window.__xfeedPushState = (stateJson: string) => {
    const next = parseAdapterState(stateJson);
    stateListener?.(next);
  };

  window.__xfeedResolveJudge = (requestId: string, verdictsJson: string) => {
    const resolver = pendingJudgeResolvers.get(requestId);
    if (!resolver) return;
    pendingJudgeResolvers.delete(requestId);
    try {
      const parsed = JSON.parse(verdictsJson) as JudgeVerdict[];
      resolver(Array.isArray(parsed) ? parsed : []);
    } catch {
      resolver([]);
    }
  };

  const androidBridge: HostBridge = {
    clientKind: "android",

    async loadState(): Promise<AdapterState> {
      const raw = window.XFeedAndroid?.getStateJson() ?? "{}";
      return parseAdapterState(raw);
    },

    async saveProfile(profile: TuningProfile): Promise<void> {
      window.XFeedAndroid?.saveProfileJson(JSON.stringify(profile));
    },

    async recordFeedback(
      event: FeedbackEvent,
      updatedProfile: TuningProfile,
      updatedHistory: FeedbackEvent[],
    ): Promise<void> {
      window.XFeedAndroid?.recordFeedbackJson(
        JSON.stringify(event),
        JSON.stringify(updatedProfile),
        JSON.stringify(updatedHistory),
      );
    },

    async judgePosts(
      posts: PostCandidate[],
      profile: TuningProfile,
      feedbackHistory: FeedbackEvent[],
    ): Promise<JudgeVerdict[]> {
      if (typeof window.XFeedAndroid?.requestJudgeBatch !== "function") {
        return [];
      }
      const reqId = `judge-${++judgeSeq}`;
      return await new Promise<JudgeVerdict[]>((resolve) => {
        const timeout = setTimeout(() => {
          pendingJudgeResolvers.delete(reqId);
          resolve([]);
        }, 12000);

        pendingJudgeResolvers.set(reqId, (verdicts) => {
          clearTimeout(timeout);
          resolve(verdicts);
        });

        window.XFeedAndroid?.requestJudgeBatch?.(
          reqId,
          JSON.stringify(posts),
          JSON.stringify(profile),
          JSON.stringify(feedbackHistory.slice(0, 120)),
        );
      });
    },

    openTuningPanel(): void {
      window.XFeedAndroid?.openTuningPanel();
    },

    onStateUpdated(listener: (state: AdapterState) => void): void {
      stateListener = listener;
    },

    reportStats(stats: FeedStats): void {
      window.XFeedAndroid?.reportStatsJson(JSON.stringify(stats));
    },
  };

  const controller = new XFeedController(androidBridge);
  void controller.start();
}
