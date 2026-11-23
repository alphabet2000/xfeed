import { ensureProfileDefaults } from "./defaults.ts";
import { trainModelFromFeedback } from "./learner.ts";
import { mergeSnoozes } from "./novelty.ts";
import type {
  FeedbackEvent,
  JudgeVerdict,
  PostCandidate,
  SyncConfig,
  SyncStateSnapshot,
  TuningProfile,
} from "./types.ts";

export function mergeProfile(
  local: TuningProfile,
  remote: TuningProfile | null,
): TuningProfile {
  if (!remote) return local;
  if (remote.revision > local.revision) return remote;
  if (remote.revision < local.revision) return local;
  return Date.parse(remote.updatedAt) > Date.parse(local.updatedAt)
    ? remote
    : local;
}

export function mergeFeedback(
  local: FeedbackEvent[],
  remote: FeedbackEvent[],
  limit: number = 2000,
): FeedbackEvent[] {
  const byId = new Map<string, FeedbackEvent>();
  for (const ev of remote) byId.set(ev.id, ev);
  for (const ev of local) byId.set(ev.id, ev);

  return Array.from(byId.values())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export interface SyncRunResult {
  ok: boolean;
  profile: TuningProfile;
  feedbackHistory: FeedbackEvent[];
  pushedFeedbackCount: number;
  pulledFeedbackCount: number;
  serverTime?: string;
  error?: string;
}

export class SyncClient {
  private readonly config: SyncConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SyncConfig, fetchImpl: typeof fetch = globalThis.fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private get baseUrl(): string {
    return this.config.endpointUrl.replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiToken}`,
      "X-XFeed-Device": this.config.deviceId,
    };
  }

  async pullState(since?: string): Promise<SyncStateSnapshot> {
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    const response = await this.fetchImpl(`${this.baseUrl}/v1/state${query}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`Sync pull failed (${response.status})`);
    }
    return (await response.json()) as SyncStateSnapshot;
  }

  async pushProfile(profile: TuningProfile): Promise<{ accepted: boolean; profile: TuningProfile }> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/profile`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ profile }),
    });
    if (!response.ok) {
      throw new Error(`Sync profile push failed (${response.status})`);
    }
    return (await response.json()) as { accepted: boolean; profile: TuningProfile };
  }

  async pushFeedbackBatch(events: FeedbackEvent[]): Promise<{ inserted: number }> {
    if (events.length === 0) return { inserted: 0 };
    const response = await this.fetchImpl(`${this.baseUrl}/v1/feedback/batch`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ events }),
    });
    if (!response.ok) {
      throw new Error(`Sync feedback push failed (${response.status})`);
    }
    return (await response.json()) as { inserted: number };
  }

  async judgePosts(
    posts: PostCandidate[],
    profile: TuningProfile,
    feedbackHistory: FeedbackEvent[],
  ): Promise<JudgeVerdict[]> {
    if (posts.length === 0) return [];
    const response = await this.fetchImpl(`${this.baseUrl}/v1/judge`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        posts,
        profile,
        feedbackHistory: feedbackHistory.slice(0, 120),
      }),
    });
    if (!response.ok) {
      throw new Error(`Judge request failed (${response.status})`);
    }
    const data = (await response.json()) as { verdicts?: JudgeVerdict[] };
    return Array.isArray(data.verdicts) ? data.verdicts : [];
  }

  async reflectTaste(
    profile: TuningProfile,
    feedbackHistory: FeedbackEvent[],
  ): Promise<{ learnedRules: string[]; source: string }> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/reflect`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        profile,
        feedbackHistory: feedbackHistory.slice(0, 120),
      }),
    });
    if (!response.ok) {
      throw new Error(`Reflect request failed (${response.status})`);
    }
    return (await response.json()) as { learnedRules: string[]; source: string };
  }

  async syncAll(
    localProfile: TuningProfile,
    localFeedback: FeedbackEvent[],
    pendingFeedback: FeedbackEvent[],
    lastSyncedAt?: string,
  ): Promise<SyncRunResult> {
    if (!this.config.enabled || !this.config.endpointUrl || !this.config.apiToken) {
      return {
        ok: false,
        profile: localProfile,
        feedbackHistory: localFeedback,
        pushedFeedbackCount: 0,
        pulledFeedbackCount: 0,
        error: "Sync is disabled or missing endpoint/token",
      };
    }

    try {
      let pushedCount = 0;
      if (pendingFeedback.length > 0) {
        const res = await this.pushFeedbackBatch(pendingFeedback);
        pushedCount = res.inserted;
      }

      const remote = await this.pullState(lastSyncedAt);
      const mergedFeedback = mergeFeedback(localFeedback, remote.feedback);
      let mergedProfile = ensureProfileDefaults(mergeProfile(localProfile, remote.profile));

      // Conflict-free multi-device learning: recompute learnedModel from the unified feedback log
      // (or take server-computed learnedModel when full history lives on server)
      const unifiedModel =
        remote.learnedModel &&
        remote.learnedModel.trainedOnCount >= mergedFeedback.length
          ? {
              ...remote.learnedModel,
              scorerWeights: mergedProfile.learnedModel.scorerWeights,
            }
          : trainModelFromFeedback(
              mergedFeedback,
              mergedProfile.learnedModel.scorerWeights,
            );
      const mergedSnoozes = mergeSnoozes(
        localProfile.storySnoozes ?? [],
        remote.profile?.storySnoozes ?? [],
      );
      mergedProfile = {
        ...mergedProfile,
        learnedModel: unifiedModel,
        storySnoozes: mergedSnoozes,
      };

      // Push local profile if it is newer than remote (or remote has no profile yet)
      const remoteRev = remote.profile?.revision ?? 0;
      if (!remote.profile || localProfile.revision > remoteRev) {
        const pushed = await this.pushProfile(mergedProfile);
        mergedProfile = {
          ...ensureProfileDefaults(pushed.profile),
          learnedModel: unifiedModel,
        };
      }

      return {
        ok: true,
        profile: mergedProfile,
        feedbackHistory: mergedFeedback,
        pushedFeedbackCount: pushedCount,
        pulledFeedbackCount: remote.feedback.length,
        serverTime: remote.serverTime,
      };
    } catch (error) {
      return {
        ok: false,
        profile: localProfile,
        feedbackHistory: localFeedback,
        pushedFeedbackCount: 0,
        pulledFeedbackCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
