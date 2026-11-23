import type {
  ClientKind,
  FeedbackEvent,
  JudgeVerdict,
  PostCandidate,
  TuningProfile,
} from "../../engine/src/types.ts";

export interface AdapterState {
  profile: TuningProfile;
  feedbackHistory: FeedbackEvent[];
}

export interface FeedStats {
  seen: number;
  hidden: number;
  collapsed: number;
  boosted: number;
}

export interface HostBridge {
  readonly clientKind: ClientKind;
  loadState(): Promise<AdapterState>;
  saveProfile(profile: TuningProfile): Promise<void>;
  recordFeedback(
    event: FeedbackEvent,
    updatedProfile: TuningProfile,
    updatedHistory: FeedbackEvent[],
  ): Promise<void>;
  /** Optional Loop A batched semantic judge call (via sync-worker /v1/judge). */
  judgePosts?(
    posts: PostCandidate[],
    profile: TuningProfile,
    feedbackHistory: FeedbackEvent[],
  ): Promise<JudgeVerdict[]>;
  openTuningPanel?(): void;
  onStateUpdated?(listener: (state: AdapterState) => void): void;
  reportStats?(stats: FeedStats): void;
}
