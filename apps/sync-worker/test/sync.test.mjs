import test from "node:test";
import assert from "node:assert/strict";
import { createLocalSyncServer } from "../dev-server.mjs";
import {
  CustomizationEngine,
  SyncClient,
  createDefaultProfile,
} from "../../../packages/engine/src/index.ts";

test("end-to-end sync between Android and Desktop Extension via sync server", async () => {
  const token = "super-secret-personal-token";
  const server = createLocalSyncServer({ apiToken: token, dbPath: null });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const endpointUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Health check works without auth
    const health = await fetch(`${endpointUrl}/v1/health`).then((r) => r.json());
    assert.equal(health.ok, true);

    // 2. Bad token is rejected
    const badRes = await fetch(`${endpointUrl}/v1/state`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    assert.equal(badRes.status, 401);

    const engine = new CustomizationEngine();

    // 3. Android device marks a post "not interested" and syncs
    let androidProfile = createDefaultProfile("2026-11-23T08:00:00.000Z");
    const fb = engine.applyFeedback(androidProfile, [], {
      post: {
        id: "999",
        authorHandle: "spammer",
        text: "Buy this coin now",
        hashtags: ["crypto"],
      },
      action: "not_interested",
      syncedToX: true,
      sourceClient: "android",
    });
    androidProfile = fb.profile;

    const androidSync = new SyncClient({
      endpointUrl,
      apiToken: token,
      enabled: true,
      deviceId: "android-1",
    });
    const androidResult = await androidSync.syncAll(
      androidProfile,
      fb.feedbackHistory,
      [fb.event],
    );
    assert.equal(androidResult.ok, true);
    assert.equal(androidResult.pushedFeedbackCount, 1);

    // 4. Desktop Extension starts with fresh profile and syncs -> receives Android's profile & feedback
    const desktopProfile = createDefaultProfile("2026-11-23T07:00:00.000Z");
    const desktopSync = new SyncClient({
      endpointUrl,
      apiToken: token,
      enabled: true,
      deviceId: "extension-1",
    });
    const desktopResult = await desktopSync.syncAll(desktopProfile, [], []);
    assert.equal(desktopResult.ok, true);
    assert.equal(desktopResult.profile.revision, androidProfile.revision);
    assert.equal(desktopResult.profile.authorWeights["spammer"], -1.2);
    assert.equal(desktopResult.feedbackHistory.length, 1);
    assert.equal(desktopResult.feedbackHistory[0].postId, "999");

    // 5. Duplicate feedback batch push is idempotent
    const dupPush = await androidSync.pushFeedbackBatch([fb.event]);
    assert.equal(dupPush.inserted, 0);

    // 6. Loop A (/v1/judge) caches verdicts and separates farming vs counterpoint
    const samplePosts = [
      {
        id: "j1",
        authorHandle: "mixed_author",
        authorName: "Mixed",
        text: "Unpopular opinion: AI changes everything. Agree? 👇",
        isRepost: false,
        isQuote: false,
        isPromoted: false,
        hasMedia: false,
        hasVideo: false,
        links: [],
        hashtags: [],
        sourceFeed: "for_you",
      },
      {
        id: "j2",
        authorHandle: "mixed_author",
        authorName: "Mixed",
        text: "Worth noting this breaks if your system clocks drift across regions.",
        isRepost: false,
        isQuote: false,
        isPromoted: false,
        hasMedia: false,
        hasVideo: false,
        links: [],
        hashtags: [],
        sourceFeed: "for_you",
      },
    ];
    const verdicts1 = await desktopSync.judgePosts(samplePosts, desktopResult.profile, desktopResult.feedbackHistory);
    assert.equal(verdicts1.length, 2);
    assert.equal(verdicts1[0].category, "farming");
    assert.equal(verdicts1[1].category, "counterpoint");

    const verdicts2 = await desktopSync.judgePosts(samplePosts, desktopResult.profile, desktopResult.feedbackHistory);
    assert.equal(verdicts2[0].source, "cache");

    // 7. Loop B (/v1/reflect) distills taste rules
    const reflected = await desktopSync.reflectTaste(desktopResult.profile, desktopResult.feedbackHistory);
    assert.ok(Array.isArray(reflected.learnedRules));

    // 8. Loop C conflict-free multi-device model training:
    //    Desktop upvotes a technical counterpoint while Android previously downvoted spam -> both converge!
    const desktopFb = engine.applyFeedback(desktopResult.profile, desktopResult.feedbackHistory, {
      post: {
        id: "cp-888",
        authorHandle: "quiet_eng",
        text: "Worth noting this breaks if your system clocks drift across regions.",
        hashtags: ["distributed"],
      },
      action: "upvote",
      sourceClient: "extension",
    });
    const desktopAfter = await desktopSync.syncAll(
      desktopFb.profile,
      desktopFb.feedbackHistory,
      [desktopFb.event],
    );
    assert.equal(desktopAfter.ok, true);
    assert.equal(desktopAfter.profile.learnedModel.trainedOnCount, 2);

    // Android syncs next and receives the EXACT same merged learnedModel parameters
    const androidAfter = await androidSync.syncAll(
      androidResult.profile,
      androidResult.feedbackHistory,
      [],
    );
    assert.equal(androidAfter.ok, true);
    assert.equal(androidAfter.profile.learnedModel.trainedOnCount, 2);
    assert.ok((androidAfter.profile.learnedModel.featureWeights["cue:counterpoint"] ?? 0) > 0);
    assert.ok((androidAfter.profile.learnedModel.featureWeights["t:#crypto"] ?? 0) < 0);

    // 9. Seen 24h snooze survives sync even when local profile revision is behind server revision
    const staleLocal = {
      ...androidAfter.profile,
      revision: Math.max(1, androidAfter.profile.revision - 1),
    };
    const snoozeFb = engine.applyFeedback(staleLocal, androidAfter.feedbackHistory, {
      post: {
        id: "snooze-999",
        authorHandle: "news_wire",
        text: "Breaking: Quantum chip milestone announced by lab researchers today",
        hashtags: ["quantum"],
      },
      action: "seen_story",
      sourceClient: "android",
    });
    const snoozeSync = await androidSync.syncAll(
      snoozeFb.profile,
      snoozeFb.feedbackHistory,
      [snoozeFb.event],
    );
    assert.equal(snoozeSync.ok, true);
    assert.ok(snoozeSync.profile.storySnoozes.some((s) => s.postId === "snooze-999"));

    // Desktop syncs and receives the 24h story snooze too
    const desktopSnoozeSync = await desktopSync.syncAll(
      desktopAfter.profile,
      desktopAfter.feedbackHistory,
      [],
    );
    assert.equal(desktopSnoozeSync.ok, true);
    assert.ok(desktopSnoozeSync.profile.storySnoozes.some((s) => s.postId === "snooze-999"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
