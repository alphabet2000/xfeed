import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomizationEngine,
  createDefaultProfile,
  distillTasteRulesLocally,
  evaluateWithLocalRubric,
  mergeFeedback,
  mergeProfile,
  scoreEmbeddingWithHead,
  trainEmbeddingHead,
} from "../src/index.ts";
import type { AsyncPostScorer, PostCandidate } from "../src/types.ts";

function makePost(overrides: Partial<PostCandidate> = {}): PostCandidate {
  return {
    id: "1001",
    authorHandle: "alice_dev",
    authorName: "Alice",
    text: "Deep dive into compilers and WebAssembly memory layouts.",
    isRepost: false,
    isQuote: false,
    isPromoted: false,
    hasMedia: false,
    hasVideo: false,
    links: [],
    hashtags: ["wasm"],
    sourceFeed: "for_you",
    ...overrides,
  };
}

test("promoted posts are collapsed or hidden based on displayMode", () => {
  const engine = new CustomizationEngine();
  const profile = createDefaultProfile();
  const promoted = makePost({ id: "ad1", isPromoted: true });

  const collapsed = engine.evaluate(promoted, profile);
  assert.equal(collapsed.action, "collapse");
  assert.ok(collapsed.reasons.some((r) => r.scorerId === "content-filter"));

  const strictProfile = {
    ...profile,
    uiOptions: { ...profile.uiOptions, displayMode: "hide" as const },
  };
  const hidden = engine.evaluate(promoted, strictProfile);
  assert.equal(hidden.action, "hide");
});

test("keyword rules support substring and regex boosting and filtering", () => {
  const engine = new CustomizationEngine();
  const profile = createDefaultProfile();
  profile.rules = [
    {
      id: "r1",
      pattern: "webassembly",
      isRegex: false,
      weight: 3.5,
      label: "WASM",
      enabled: true,
    },
    {
      id: "r2",
      pattern: "\\bgiveaway\\b|\\bcrypto pump\\b",
      isRegex: true,
      weight: -6,
      label: "Spam",
      enabled: true,
    },
  ];

  const boosted = engine.evaluate(makePost(), profile);
  assert.equal(boosted.action, "boost");
  assert.equal(boosted.score, 3.5);

  const filtered = engine.evaluate(
    makePost({ id: "1002", text: "Huge giveaway! Follow and retweet!" }),
    profile,
  );
  assert.equal(filtered.action, "collapse");
  assert.equal(filtered.score, -6);
});

test("feedback updates author weights, remembers dismissed post, and learns overlapping terms", () => {
  const engine = new CustomizationEngine();
  let profile = createDefaultProfile();
  let history = [] as ReturnType<CustomizationEngine["applyFeedback"]>["feedbackHistory"];
  const now = Date.UTC(2026, 10, 23, 12, 0, 0);

  const post1 = makePost({
    id: "2001",
    authorHandle: "@NoiseBot",
    text: "Daily engagement farming thread about celebrity gossip drama",
    hashtags: ["drama"],
  });

  const applied = engine.applyFeedback(profile, history, {
    post: post1,
    action: "not_interested",
    syncedToX: true,
    sourceClient: "android",
    now,
  });
  profile = applied.profile;
  history = applied.feedbackHistory;

  assert.equal(profile.revision, 2);
  assert.equal(profile.authorWeights["noisebot"], -1.2);
  assert.equal(applied.event.syncedToX, true);

  // Exact post is immediately filtered
  const samePostDecision = engine.evaluate(post1, profile, history, now + 1000);
  assert.equal(samePostDecision.action, "collapse");

  // Second similar post from same author gets combined negative author weight + term overlap penalty
  const post2 = makePost({
    id: "2002",
    authorHandle: "noisebot",
    text: "More celebrity gossip drama in this thread",
    hashtags: ["drama"],
  });
  const similarDecision = engine.evaluate(post2, profile, history, now + 2000);
  assert.ok(similarDecision.score <= -2.0);
  assert.ok(similarDecision.reasons.some((r) => r.scorerId === "author-weights"));
  assert.ok(similarDecision.reasons.some((r) => r.scorerId === "learned-model"));
});

test("pluggable async scorer extends evaluateAsync without changing core engine", async () => {
  const engine = new CustomizationEngine();
  const mockLlmScorer: AsyncPostScorer = {
    id: "mock-llm",
    async scoreAsync(post) {
      if (post.text.includes("compilers")) {
        return {
          delta: 4,
          reasons: [{ scorerId: "mock-llm", delta: 4, message: "High technical depth" }],
        };
      }
      return { delta: 0, reasons: [] };
    },
  };
  engine.registerAsyncScorer(mockLlmScorer);

  const decision = await engine.evaluateAsync(makePost(), createDefaultProfile());
  assert.equal(decision.action, "boost");
  assert.equal(decision.score, 4);
  assert.ok(decision.reasons.some((r) => r.scorerId === "mock-llm"));
});

test("mergeProfile and mergeFeedback preserve latest revision and deduplicate events", () => {
  const p1 = createDefaultProfile("2026-11-23T08:00:00.000Z");
  const p2 = { ...p1, revision: 3, updatedAt: "2026-11-23T09:00:00.000Z" };
  assert.equal(mergeProfile(p1, p2).revision, 3);
  assert.equal(mergeProfile(p2, p1).revision, 3);

  const merged = mergeFeedback(
    [
      {
        id: "e1",
        postId: "1",
        authorHandle: "a",
        action: "not_interested",
        syncedToX: true,
        sourceClient: "android",
        createdAt: "2026-11-23T08:00:00.000Z",
      },
    ],
    [
      {
        id: "e1",
        postId: "1",
        authorHandle: "a",
        action: "not_interested",
        syncedToX: true,
        sourceClient: "android",
        createdAt: "2026-11-23T08:00:00.000Z",
      },
      {
        id: "e2",
        postId: "2",
        authorHandle: "b",
        action: "more_like_this",
        syncedToX: false,
        sourceClient: "extension",
        createdAt: "2026-11-23T09:00:00.000Z",
      },
    ],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "e2");
});

test("same author: farming post is filtered without punishing author's good post, and brief counterpoints are kept", () => {
  const engine = new CustomizationEngine();
  let profile = createDefaultProfile();
  let history = [] as ReturnType<CustomizationEngine["applyFeedback"]>["feedbackHistory"];

  const goodPost = makePost({
    id: "same-1",
    authorHandle: "alex_builder",
    text: "We migrated from Redis to SQLite WAL and cut p99 latency from 140ms to 18ms because we eliminated cross-AZ hops.",
    hashtags: ["systems"],
  });
  const farmingPost = makePost({
    id: "same-2",
    authorHandle: "alex_builder",
    text: "Unpopular opinion: 99% of engineers fail because they don't hustle hard enough. Agree? 👇",
    hashtags: [],
  });
  const shortCounterpoint = makePost({
    id: "cp-1",
    authorHandle: "quiet_eng",
    text: "Worth noting this breaks if your system clocks drift across regions.",
    hashtags: [],
  });

  // Mark the farming post as farming — should NOT add an author penalty!
  const fb = engine.applyFeedback(profile, history, {
    post: farmingPost,
    action: "farming",
    reasonTag: "reply_bait",
    syncedToX: true,
    sourceClient: "android",
  });
  profile = fb.profile;
  history = fb.feedbackHistory;
  assert.equal(profile.authorWeights["alex_builder"], undefined);

  // Judge evaluates each post independently
  const goodVerdict = evaluateWithLocalRubric(goodPost, profile, history);
  const farmingVerdict = evaluateWithLocalRubric(farmingPost, profile, history);
  const cpVerdict = evaluateWithLocalRubric(shortCounterpoint, profile, history);

  assert.equal(engine.evaluate(goodPost, profile, history, Date.now(), goodVerdict).action, "boost");
  assert.equal(engine.evaluate(farmingPost, profile, history, Date.now(), farmingVerdict).action, "collapse");
  assert.equal(cpVerdict.category, "counterpoint");
  assert.equal(engine.evaluate(shortCounterpoint, profile, history, Date.now(), cpVerdict).action, "boost");

  // Loop B reflection distills editable rules
  const learned = distillTasteRulesLocally(history, []);
  assert.ok(learned.length >= 1);
});

test("Speed 1 online learning trains time-decayed L2 logistic head on 384-dim embeddings", () => {
  const dim = 384;
  const makeVec = (seed: number, sign: number) =>
    Array.from({ length: dim }, (_, i) =>
      i < 24 ? sign * (0.8 + ((i + seed) % 5) * 0.05) : (((i * 17 + seed) % 7) - 3) * 0.02,
    );

  const now = Date.UTC(2026, 10, 23, 12, 0, 0);
  const feedback = [
    ...Array.from({ length: 8 }, (_, k) => ({
      id: `pos-${k}`,
      postId: `p-${k}`,
      authorHandle: "good_author",
      action: "upvote" as const,
      syncedToX: false,
      sourceClient: "extension" as const,
      createdAt: new Date(now - k * 3600_000).toISOString(),
      postSnippet: "Technical insight",
      embedding: makeVec(k, 1),
    })),
    ...Array.from({ length: 8 }, (_, k) => ({
      id: `neg-${k}`,
      postId: `n-${k}`,
      authorHandle: "bait_author",
      action: "downvote" as const,
      syncedToX: true,
      sourceClient: "android" as const,
      createdAt: new Date(now - k * 3600_000).toISOString(),
      postSnippet: "Engagement bait",
      embedding: makeVec(k + 100, -1),
    })),
  ];

  const head = trainEmbeddingHead(feedback, { now });
  assert.ok(head);
  assert.equal(head.dim, 384);
  assert.equal(head.trainedOnCount, 16);

  const posPred = scoreEmbeddingWithHead(makeVec(42, 1), head);
  const negPred = scoreEmbeddingWithHead(makeVec(42, -1), head);
  assert.ok(posPred && posPred.prob > 0.85 && posPred.delta > 2.5);
  assert.ok(negPred && negPred.prob < 0.15 && negPred.delta < -2.5);
});

test("Seen 24h snoozes repeated breaking stories temporarily without poisoning long-term taste", () => {
  const engine = new CustomizationEngine();
  let profile = createDefaultProfile();
  let history = [] as ReturnType<CustomizationEngine["applyFeedback"]>["feedbackHistory"];
  const now = Date.UTC(2026, 10, 23, 12, 0, 0);

  const nvda1 = makePost({
    id: "nvda-1",
    authorHandle: "news_one",
    text: "JUST IN: NVIDIA board reinstates Jensen Huang as CEO after brief resignation.",
    hashtags: ["nvda"],
  });
  const nvda2 = makePost({
    id: "nvda-2",
    authorHandle: "news_two",
    text: "Breaking: Jensen Huang reinstated as NVIDIA CEO by the board today.",
    hashtags: ["nvda"],
  });

  // 1. User marks Seen 24h on nvda1 -> creates temporary snooze, ZERO long-term learner poisoning!
  const fb = engine.applyFeedback(profile, history, {
    post: nvda1,
    action: "seen_story",
    sourceClient: "extension",
    now,
  });
  profile = fb.profile;
  history = fb.feedbackHistory;

  assert.equal(profile.storySnoozes.length, 1);
  assert.equal(profile.learnedModel.trainedOnCount, 0);
  assert.equal(profile.authorWeights["news_one"], undefined);

  // 2. Another post about the same story 2 hours later is collapsed automatically
  const during24h = engine.evaluate(nvda2, profile, history, now + 2 * 3600_000);
  assert.equal(during24h.action, "collapse");
  assert.ok(during24h.reasons.some((r) => r.scorerId === "story-novelty"));

  // 3. After 25 hours, the snooze expires automatically and NVIDIA news flows freely again!
  const after25h = engine.evaluate(nvda2, profile, history, now + 25 * 3600_000);
  assert.equal(after25h.action, "show");

  // 4. Layer 1 automatic rolling 24h dedupe collapses duplicate headline without any click,
  //    but lets a genuine counterpoint through!
  const seenBuffer = [
    {
      postId: nvda1.id,
      authorHandle: nvda1.authorHandle,
      terms: ["just", "nvidia", "board", "reinstates", "jensen", "huang", "brief", "resignation", "#nvda"],
      seenAt: now,
    },
  ];
  const dedupeProfile = {
    ...createDefaultProfile(),
    uiOptions: { ...createDefaultProfile().uiOptions, dedupeRepeatedStories: true },
  };
  const autoDedupe = engine.evaluate(nvda2, dedupeProfile, [], now + 60_000, undefined, seenBuffer);
  assert.equal(autoDedupe.action, "collapse");
  const dedupeReason = autoDedupe.reasons.find((r) => r.scorerId === "story-novelty")?.message ?? "";
  assert.match(dedupeReason, /nvidia/i);
  assert.match(dedupeReason, /jensen|huang|#nvda/i);

  const counterpoint = engine.evaluate(
    nvda2,
    dedupeProfile,
    [],
    now + 60_000,
    {
      postId: nvda2.id,
      worthwhile: 8,
      farming: 1,
      category: "counterpoint",
      reason: "Offers governance counterpoint",
      similarExampleIds: [],
      source: "workers-ai",
      evaluatedAt: new Date(now).toISOString(),
    },
    seenBuffer,
  );
  assert.equal(counterpoint.action, "boost");
});

test("Less @author collapses both the clicked post and subsequent posts from that author even with positive AI verdict", () => {
  const engine = new CustomizationEngine();
  let profile = createDefaultProfile();
  let history = [] as ReturnType<CustomizationEngine["applyFeedback"]>["feedbackHistory"];

  const post1 = makePost({ id: "la-1", authorHandle: "noisy_person", text: "Just another casual thought" });
  const post2 = makePost({ id: "la-2", authorHandle: "noisy_person", text: "Second casual post from same author" });

  const applied = engine.applyFeedback(profile, history, {
    post: post1,
    action: "less_author",
    sourceClient: "extension",
  });
  profile = applied.profile;
  history = applied.feedbackHistory;

  const mildAiVerdict = {
    postId: post2.id,
    worthwhile: 4.5,
    farming: 1.5,
    category: "casual" as const,
    reason: "Authentic casual post",
    similarExampleIds: [],
    source: "workers-ai" as const,
    evaluatedAt: new Date().toISOString(),
  };

  // Clicked post collapses immediately even with positive verdict
  assert.equal(
    engine.evaluate(post1, profile, history, Date.now(), { ...mildAiVerdict, postId: post1.id }).action,
    "collapse",
  );
  // Subsequent casual post from same author also collapses (-3.5 author + 1.65 casual = -1.85 <= -1.5)
  assert.equal(
    engine.evaluate(post2, profile, history, Date.now(), mildAiVerdict).action,
    "collapse",
  );
});

test("Seen 24h respects Hard Hide mode on clicked, similar, and semantically snoozed posts", () => {
  const engine = new CustomizationEngine();
  const now = Date.parse("2026-06-01T12:00:00.000Z");
  let profile = createDefaultProfile(new Date(now).toISOString());
  profile = {
    ...profile,
    authorWeights: { fav_author: 4.0 },
    uiOptions: {
      ...profile.uiOptions,
      displayMode: "hide",
    },
  };
  let history = [] as ReturnType<CustomizationEngine["applyFeedback"]>["feedbackHistory"];

  const post1 = makePost({
    id: "sn-1",
    authorHandle: "fav_author",
    text: "Breaking: Acme acquires BetaCorp for 12 billion dollars in cash deal",
    hashtags: ["acme"],
  });
  const post2 = makePost({
    id: "sn-2",
    authorHandle: "fav_author",
    text: "Acme acquires BetaCorp for 12 billion dollars in surprise buyout",
    hashtags: ["acme"],
  });
  const post3 = makePost({
    id: "sn-3",
    authorHandle: "fav_author",
    text: "Completely rephrased headline about the big enterprise merger",
  });

  const applied = engine.applyFeedback(profile, history, {
    post: post1,
    action: "seen_story",
    sourceClient: "extension",
    now,
  });
  profile = applied.profile;
  history = applied.feedbackHistory;

  const positiveVerdict = {
    postId: post1.id,
    worthwhile: 8.5,
    farming: 0.5,
    category: "insight" as const,
    reason: "High signal post",
    similarExampleIds: [],
    source: "workers-ai" as const,
    evaluatedAt: new Date(now).toISOString(),
  };

  // Clicked post must fully hide in Hard Hide mode even with boosted author & positive AI verdict
  assert.equal(engine.evaluate(post1, profile, history, now + 1000, positiveVerdict).action, "hide");
  // Similar story post must also fully hide in Hard Hide mode (not stay as a collapse stub)
  assert.equal(
    engine.evaluate(post2, profile, history, now + 60_000, { ...positiveVerdict, postId: post2.id }).action,
    "hide",
  );
  // Semantic story-snooze verdict from worker must also hide in Hard Hide mode despite boosted author
  assert.equal(
    engine.evaluate(post3, profile, history, now + 60_000, {
      postId: post3.id,
      worthwhile: 1.5,
      farming: 8.0,
      category: "neutral",
      reason: "Snoozed 24h (acme · acquires · betacorp)",
      similarExampleIds: [],
      source: "story-snooze",
      evaluatedAt: new Date(now).toISOString(),
    }).action,
    "hide",
  );
});

test("Precision-first guards protect uncertain posts, short chart/media posts, and trusted authors while collapsing blatant spam", () => {
  const engine = new CustomizationEngine();
  let profile = createDefaultProfile();
  let history = [] as ReturnType<CustomizationEngine["applyFeedback"]>["feedbackHistory"];
  const now = Date.now();

  // 1. Uncertain / moderate AI verdict must never collapse a normal post
  const normalPost = makePost({ id: "pf-1", authorHandle: "some_user", text: "Interesting market move today across bonds and equities." });
  const mildNeg = engine.evaluate(normalPost, profile, history, now, {
    postId: normalPost.id,
    worthwhile: 2.5,
    farming: 6.0,
    category: "low_fit",
    reason: "Mild uncertainty",
    similarExampleIds: [],
    source: "workers-ai",
    evaluatedAt: new Date(now).toISOString(),
  });
  assert.equal(mildNeg.action, "show");

  // 2. Short caption with attached chart/media must not be auto-collapsed by text-only AI
  const chartPost = makePost({ id: "pf-2", authorHandle: "new_chartist", text: "$dxy is sell below", hasMedia: true });
  const chartEval = engine.evaluate(chartPost, profile, history, now, {
    postId: chartPost.id,
    worthwhile: 1.0,
    farming: 9.0,
    category: "farming",
    reason: "Short cryptic ticker caption",
    similarExampleIds: [],
    source: "workers-ai",
    evaluatedAt: new Date(now).toISOString(),
  });
  assert.equal(chartEval.action, "show");

  // 3. Trusted author (2+ upvotes or Keep rescues) must not be auto-collapsed by AI
  for (const id of ["pf-t1", "pf-t2"]) {
    const res = engine.applyFeedback(profile, history, {
      post: makePost({ id, authorHandle: "swingtrader", text: "Chart level test" }),
      action: "false_positive",
      sourceClient: "extension",
      now,
    });
    profile = res.profile;
    history = res.feedbackHistory;
  }
  const trustedPost = makePost({ id: "pf-3", authorHandle: "swingtrader", text: "Longer text post from trusted author without media that AI misjudges." });
  const trustedEval = engine.evaluate(trustedPost, profile, history, now, {
    postId: trustedPost.id,
    worthwhile: 1.0,
    farming: 9.0,
    category: "rage_bait",
    reason: "Misread tone",
    similarExampleIds: [],
    source: "workers-ai",
    evaluatedAt: new Date(now).toISOString(),
  });
  assert.equal(trustedEval.action, "show");

  // 4. Blatant non-media rage-bait / farming from untrusted author DOES collapse
  const spamPost = makePost({
    id: "pf-4",
    authorHandle: "grifter",
    text: "UNPOPULAR OPINION: 99% of people are lazy sheep. Agree? 👇🔥",
    hashtags: [],
  });
  const spamEval = engine.evaluate(spamPost, profile, history, now, {
    postId: spamPost.id,
    worthwhile: 2.0,
    farming: 8.5,
    category: "rage_bait",
    reason: "Blatant rage-bait",
    similarExampleIds: [],
    source: "workers-ai",
    evaluatedAt: new Date(now).toISOString(),
  });
  assert.equal(spamEval.action, "collapse");
});
