import {
  buildJudgeSystemPrompt,
  distillTasteRulesLocally,
  ensureProfileDefaults,
  evaluateWithLocalRubric,
  matchStorySnooze,
  mergeSnoozes,
  pruneExpiredSnoozes,
  retrieveSimilarExamples,
  scoreEmbeddingWithHead,
  trainEmbeddingHead,
  trainModelFromFeedback,
} from "../../../packages/engine/src/index.ts";
import type {
  FeedbackEvent,
  JudgeCategory,
  JudgeVerdict,
  PostCandidate,
  StorySnooze,
  TuningProfile,
} from "../../../packages/engine/src/types.ts";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<Array<{ meta?: { changes?: number } }>>;
}

interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface WorkerEnv {
  DB: D1Database;
  AI?: WorkersAiBinding;
  SYNC_API_TOKEN: string;
}

const MAX_BODY_BYTES = 512 * 1024;
const MAX_FEEDBACK_BATCH = 200;
const MAX_FEEDBACK_RETURN = 1000;
const MAX_JUDGE_BATCH = 12;
const WORKERS_AI_JUDGE_MODEL = "@cf/meta/llama-3.2-3b-instruct";
const WORKERS_AI_EMBED_MODEL = "@cf/baai/bge-small-en-v1.5";

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-XFeed-Device",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(
  request: Request,
  body: unknown,
  status: number = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request),
    },
  });
}

async function verifyBearerToken(
  request: Request,
  expectedToken: string,
): Promise<boolean> {
  if (!expectedToken) return false;
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const provided = auth.slice(7).trim();
  if (!provided) return false;

  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),
  ]);

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(providedHash, expectedHash);
  }

  const a = new Uint8Array(providedHash);
  const b = new Uint8Array(expectedHash);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function readBoundedJson<T>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "Payload too large");
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "Payload too large");
  }
  const text = new TextDecoder().decode(buffer);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON payload");
  }
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ProfileRow {
  revision: number;
  updated_at: string;
  profile_json: string;
}

interface FeedbackRow {
  id: string;
  post_id: string;
  author_handle: string;
  action: FeedbackEvent["action"];
  reason_tag: string | null;
  synced_to_x: number;
  source_client: FeedbackEvent["sourceClient"];
  created_at: string;
  post_snippet: string | null;
  quoted_snippet: string | null;
  terms_json: string | null;
  embedding_json?: string | null;
}

interface JudgeCacheRow {
  post_id: string;
  profile_rev: number;
  verdict_json: string;
}

interface StorySnoozeRow {
  id: string;
  post_id: string;
  label: string;
  terms_json: string;
  embedding_json: string | null;
  created_at: string;
  expires_at: string;
  source_client: StorySnooze["sourceClient"];
}

function rowToSnooze(row: StorySnoozeRow, includeEmbedding: boolean = false): StorySnooze {
  let terms: string[] = [];
  try {
    terms = JSON.parse(row.terms_json) as string[];
  } catch {
    terms = [];
  }
  let embedding: number[] | undefined;
  if (includeEmbedding && row.embedding_json) {
    try {
      embedding = JSON.parse(row.embedding_json) as number[];
    } catch {
      embedding = undefined;
    }
  }
  return {
    id: row.id,
    postId: row.post_id,
    label: row.label,
    terms,
    embedding,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    sourceClient: row.source_client,
  };
}

async function loadActiveSnoozes(
  env: WorkerEnv,
  includeEmbedding: boolean = false,
): Promise<StorySnooze[]> {
  const nowIso = new Date().toISOString();
  try {
    const res = await env.DB.prepare(
      "SELECT id, post_id, label, terms_json, embedding_json, created_at, expires_at, source_client FROM story_snoozes WHERE expires_at > ? ORDER BY created_at DESC LIMIT 100",
    )
      .bind(nowIso)
      .all<StorySnoozeRow>();
    return res.results.map((r) => rowToSnooze(r, includeEmbedding));
  } catch {
    return [];
  }
}

async function persistActiveSnoozes(
  env: WorkerEnv,
  snoozes: StorySnooze[],
): Promise<void> {
  const active = pruneExpiredSnoozes(snoozes);
  const nowIso = new Date().toISOString();
  try {
    await env.DB.prepare("DELETE FROM story_snoozes WHERE expires_at <= ?")
      .bind(nowIso)
      .run();
    if (active.length === 0) return;

    const existing = await loadActiveSnoozes(env, false);
    const existingIds = new Set(existing.map((s) => s.id));
    const toInsert = active.filter((s) => !existingIds.has(s.id));
    if (toInsert.length === 0) return;

    const embeddings = await computeEmbeddings(
      env,
      toInsert.map((s) => `${s.label} ${s.terms.join(" ")}`.trim()),
    );

    const stmt = env.DB.prepare(
      `INSERT OR IGNORE INTO story_snoozes
        (id, post_id, label, terms_json, embedding_json, created_at, expires_at, source_client)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await env.DB.batch(
      toInsert.map((s, idx) =>
        stmt.bind(
          s.id,
          s.postId,
          s.label,
          JSON.stringify(s.terms),
          embeddings[idx] ? JSON.stringify(embeddings[idx]) : null,
          s.createdAt,
          s.expiresAt,
          s.sourceClient ?? "unknown",
        ),
      ),
    );
  } catch {
    // Non-fatal if table not yet migrated
  }
}

function rowToFeedback(row: FeedbackRow, includeEmbedding: boolean = false): FeedbackEvent {
  let terms: string[] | undefined;
  if (row.terms_json) {
    try {
      terms = JSON.parse(row.terms_json) as string[];
    } catch {
      terms = undefined;
    }
  }
  let embedding: number[] | undefined;
  if (includeEmbedding && row.embedding_json) {
    try {
      embedding = JSON.parse(row.embedding_json) as number[];
    } catch {
      embedding = undefined;
    }
  }
  return {
    id: row.id,
    postId: row.post_id,
    authorHandle: row.author_handle,
    action: row.action,
    reasonTag: row.reason_tag ?? undefined,
    syncedToX: row.synced_to_x === 1,
    sourceClient: row.source_client,
    createdAt: row.created_at,
    postSnippet: row.post_snippet ?? undefined,
    quotedSnippet: row.quoted_snippet ?? undefined,
    terms,
    embedding,
  };
}

async function computeEmbeddings(
  env: WorkerEnv,
  texts: string[],
): Promise<Array<number[] | null>> {
  if (!env.AI || texts.length === 0) return texts.map(() => null);
  try {
    const resp = await env.AI.run(WORKERS_AI_EMBED_MODEL, {
      text: texts.map((t) => t.slice(0, 320)),
    });
    const data = resp.data;
    if (Array.isArray(data)) {
      return texts.map((_, idx) =>
        Array.isArray(data[idx]) ? (data[idx] as number[]) : null,
      );
    }
  } catch {
    // Graceful fallback to lexical retrieval
  }
  return texts.map(() => null);
}

async function handleGetState(
  request: Request,
  env: WorkerEnv,
  url: URL,
): Promise<Response> {
  const since = url.searchParams.get("since");

  const profileRow = await env.DB.prepare(
    "SELECT revision, updated_at, profile_json FROM profile_state WHERE id = ?",
  )
    .bind("default")
    .first<ProfileRow>();

  const baseProfile: TuningProfile | null = profileRow
    ? ensureProfileDefaults(JSON.parse(profileRow.profile_json) as TuningProfile)
    : null;

  // Always compute conflict-free cloud learnedModel (both sparse token weights + 384-dim embedding head)
  const recentAllResult = await env.DB.prepare(
    "SELECT id, post_id, author_handle, action, reason_tag, synced_to_x, source_client, created_at, post_snippet, quoted_snippet, terms_json, embedding_json FROM feedback_events ORDER BY created_at DESC LIMIT 600",
  ).all<FeedbackRow>();
  const allRecentWithEmb = recentAllResult.results.map((r) => rowToFeedback(r, true));
  const learnedModel = trainModelFromFeedback(
    allRecentWithEmb,
    baseProfile?.learnedModel?.scorerWeights,
  );
  // Strip raw 384-dim embedding arrays from client feedback payloads to keep sync fast & light
  const allRecentFeedback = allRecentWithEmb.map(({ embedding: _emb, ...rest }) => rest);

  const activeSnoozes = await loadActiveSnoozes(env, false);
  const profile: TuningProfile | null = baseProfile
    ? {
        ...baseProfile,
        learnedModel,
        storySnoozes: mergeSnoozes(baseProfile.storySnoozes ?? [], activeSnoozes),
      }
    : null;

  const feedback = since
    ? (
        await env.DB.prepare(
          "SELECT id, post_id, author_handle, action, reason_tag, synced_to_x, source_client, created_at, post_snippet, quoted_snippet, terms_json FROM feedback_events WHERE created_at > ? ORDER BY created_at DESC LIMIT ?",
        )
          .bind(since, MAX_FEEDBACK_RETURN)
          .all<FeedbackRow>()
      ).results.map((r) => rowToFeedback(r, false))
    : allRecentFeedback.slice(0, MAX_FEEDBACK_RETURN);

  return jsonResponse(request, {
    profile,
    feedback,
    learnedModel,
    serverTime: new Date().toISOString(),
  });
}

async function handlePutProfile(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const body = await readBoundedJson<{ profile?: TuningProfile }>(request);
  const incoming = body.profile;
  if (
    !incoming ||
    incoming.version !== 1 ||
    typeof incoming.revision !== "number" ||
    typeof incoming.updatedAt !== "string"
  ) {
    throw new HttpError(400, "Invalid profile payload");
  }

  const normalized = ensureProfileDefaults(incoming);

  const existing = await env.DB.prepare(
    "SELECT revision, updated_at, profile_json FROM profile_state WHERE id = ?",
  )
    .bind("default")
    .first<ProfileRow>();

  if (existing) {
    const existingProfile = ensureProfileDefaults(
      JSON.parse(existing.profile_json) as TuningProfile,
    );
    const isStale =
      normalized.revision < existing.revision ||
      (normalized.revision === existing.revision &&
        Date.parse(normalized.updatedAt) < Date.parse(existing.updated_at));
    if (isStale) {
      return jsonResponse(request, {
        accepted: false,
        profile: existingProfile,
      });
    }
  }

  const cleanedProfile: TuningProfile = {
    ...normalized,
    storySnoozes: pruneExpiredSnoozes(normalized.storySnoozes ?? []),
  };

  await persistActiveSnoozes(env, cleanedProfile.storySnoozes);

  await env.DB.prepare(
    `INSERT INTO profile_state (id, revision, updated_at, profile_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       revision = excluded.revision,
       updated_at = excluded.updated_at,
       profile_json = excluded.profile_json`,
  )
    .bind("default", cleanedProfile.revision, cleanedProfile.updatedAt, JSON.stringify(cleanedProfile))
    .run();

  return jsonResponse(request, {
    accepted: true,
    profile: cleanedProfile,
  });
}

async function handlePostFeedbackBatch(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const body = await readBoundedJson<{ events?: FeedbackEvent[] }>(request);
  if (!Array.isArray(body.events)) {
    throw new HttpError(400, "events array is required");
  }
  if (body.events.length > MAX_FEEDBACK_BATCH) {
    throw new HttpError(400, `Maximum ${MAX_FEEDBACK_BATCH} events per batch`);
  }
  if (body.events.length === 0) {
    return jsonResponse(request, { inserted: 0 });
  }

  const textsForEmbed = body.events.map((ev) =>
    `${ev.postSnippet ?? ""} ${ev.quotedSnippet ?? ""}`.trim(),
  );
  const embeddings = await computeEmbeddings(env, textsForEmbed);

  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO feedback_events
      (id, post_id, author_handle, action, reason_tag, synced_to_x, source_client, created_at, post_snippet, quoted_snippet, terms_json, embedding_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const statements = body.events.map((ev, idx) => {
    if (!ev.id || !ev.postId || !ev.action || !ev.createdAt) {
      throw new HttpError(400, "Invalid feedback event fields");
    }
    const emb = embeddings[idx];
    return stmt.bind(
      ev.id,
      ev.postId,
      ev.authorHandle ?? "",
      ev.action,
      ev.reasonTag ?? null,
      ev.syncedToX ? 1 : 0,
      ev.sourceClient ?? "unknown",
      ev.createdAt,
      ev.postSnippet ?? null,
      ev.quotedSnippet ?? null,
      ev.terms ? JSON.stringify(ev.terms) : null,
      emb ? JSON.stringify(emb) : null,
    );
  });

  const results = await env.DB.batch(statements);
  const inserted = results.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);

  return jsonResponse(request, { inserted });
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function judgeBatchWithWorkersAi(
  env: WorkerEnv,
  posts: PostCandidate[],
  profile: TuningProfile,
  feedbackHistory: FeedbackEvent[],
): Promise<JudgeVerdict[] | null> {
  if (!env.AI) return null;

  const systemPrompt = buildJudgeSystemPrompt(profile);
  const items = posts.map((post) => {
    const similar = retrieveSimilarExamples(post, feedbackHistory, 3);
    return {
      postId: post.id,
      author: `@${post.authorHandle}`,
      text: post.text.slice(0, 420),
      quotedText: post.quotedText ? post.quotedText.slice(0, 240) : undefined,
      isRepost: post.isRepost,
      isPromoted: post.isPromoted,
      similarUserRatings: similar.map((ex) => ({
        verdict: ex.action,
        tag: ex.reasonTag,
        snippet: ex.postSnippet?.slice(0, 140),
      })),
    };
  });

  try {
    const aiResp = await env.AI.run(WORKERS_AI_JUDGE_MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Judge these ${items.length} posts using the user's Feed Philosophy and similarUserRatings:\n${JSON.stringify(items)}`,
        },
      ],
      max_tokens: 700,
      temperature: 0.1,
    });

    const text =
      typeof aiResp.response === "string"
        ? aiResp.response
        : JSON.stringify(aiResp);
    const parsed = extractJsonObject(text);
    const rawVerdicts = Array.isArray(parsed?.verdicts)
      ? (parsed.verdicts as Array<Record<string, unknown>>)
      : null;
    if (!rawVerdicts) return null;

    const nowIso = new Date().toISOString();
    const byId = new Map<string, JudgeVerdict>();
    const validCategories = new Set<JudgeCategory>([
      "insight",
      "counterpoint",
      "casual",
      "news",
      "farming",
      "rage_bait",
      "promo",
      "neutral",
    ]);

    for (const item of rawVerdicts) {
      const postId = String(item.postId ?? "");
      if (!postId) continue;
      const cat = String(item.category ?? "neutral") as JudgeCategory;
      byId.set(postId, {
        postId,
        worthwhile: Math.max(0, Math.min(10, Number(item.worthwhile ?? 5))),
        farming: Math.max(0, Math.min(10, Number(item.farming ?? 2))),
        category: validCategories.has(cat) ? cat : "neutral",
        reason: String(item.reason ?? "Evaluated by AI judge").slice(0, 80),
        similarExampleIds: [],
        source: "workers-ai",
        evaluatedAt: nowIso,
      });
    }

    return posts.map(
      (p) => byId.get(p.id) ?? evaluateWithLocalRubric(p, profile, feedbackHistory, nowIso),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        message: "workers-ai judge fallback triggered",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

async function handleJudgePosts(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const body = await readBoundedJson<{
    posts?: PostCandidate[];
    profile?: TuningProfile;
    feedbackHistory?: FeedbackEvent[];
  }>(request);

  if (!Array.isArray(body.posts) || body.posts.length === 0) {
    return jsonResponse(request, { verdicts: [] });
  }

  const posts = body.posts.slice(0, MAX_JUDGE_BATCH);
  const profile = ensureProfileDefaults(body.profile);
  const feedbackHistory = Array.isArray(body.feedbackHistory)
    ? body.feedbackHistory
    : [];

  // 1. Check D1 verdict cache by postId + profile revision
  const cachedById = new Map<string, JudgeVerdict>();
  const uncached: PostCandidate[] = [];

  for (const post of posts) {
    const cached = await env.DB.prepare(
      "SELECT post_id, profile_rev, verdict_json FROM judge_cache WHERE post_id = ?",
    )
      .bind(post.id)
      .first<JudgeCacheRow>();
    if (cached && cached.profile_rev === profile.revision) {
      try {
        const verdict = JSON.parse(cached.verdict_json) as JudgeVerdict;
        cachedById.set(post.id, { ...verdict, source: "cache" });
        continue;
      } catch {
        // Re-evaluate if corrupt
      }
    }
    uncached.push(post);
  }

  // 2. Score uncached posts: Speed 1 fast embedding head when confident, escalating uncertain/cold-start posts to Workers AI Llama 3.2
  if (uncached.length > 0) {
    const nowIso = new Date().toISOString();
    const storedFeedbackRows = await env.DB.prepare(
      "SELECT id, post_id, author_handle, action, reason_tag, synced_to_x, source_client, created_at, post_snippet, quoted_snippet, terms_json, embedding_json FROM feedback_events ORDER BY created_at DESC LIMIT 600",
    ).all<FeedbackRow>();
    const mergedHistory =
      storedFeedbackRows.results.length > 0
        ? storedFeedbackRows.results.map((r) => rowToFeedback(r, true))
        : feedbackHistory;

    const embeddingHead =
      trainEmbeddingHead(mergedHistory) ?? profile.learnedModel?.embeddingHead ?? null;
    const activeSnoozes = await loadActiveSnoozes(env, true);

    const postEmbeddings = await computeEmbeddings(
      env,
      uncached.map((p) => `${p.text} ${p.quotedText ?? ""}`.trim()),
    );

    const fastVerdicts = new Map<string, JudgeVerdict>();
    const escalatePosts: PostCandidate[] = [];
    const escalateEmbeddings: Array<number[] | null> = [];

    for (let i = 0; i < uncached.length; i++) {
      const post = uncached[i];
      const emb = postEmbeddings[i];

      // Layer 2 semantic 24h story snooze check (catches rephrased headlines with 0 LLM tokens!)
      const snoozeHit = matchStorySnooze(post, activeSnoozes, {
        postEmbedding: emb ?? undefined,
      });
      if (snoozeHit) {
        fastVerdicts.set(post.id, {
          postId: post.id,
          worthwhile: 1.5,
          farming: 8.0,
          category: "neutral",
          reason: `Snoozed 24h (${snoozeHit.label})`,
          similarExampleIds: [],
          source: "story-snooze",
          evaluatedAt: nowIso,
        });
        continue;
      }

      if (emb && embeddingHead && embeddingHead.trainedOnCount >= 12) {
        const pred = scoreEmbeddingWithHead(emb, embeddingHead);
        if (pred && pred.confidence >= 0.58) {
          const isPositive = pred.prob >= 0.5;
          fastVerdicts.set(post.id, {
            postId: post.id,
            worthwhile: Number((pred.prob * 10).toFixed(1)),
            farming: Number(((1 - pred.prob) * 10).toFixed(1)),
            category: isPositive ? "insight" : "low_fit",
            reason: isPositive
              ? `Learned taste (${Math.round(pred.prob * 100)}% match)`
              : `Learned taste (${Math.round((1 - pred.prob) * 100)}% skip)`,
            similarExampleIds: [],
            source: "embedding-head",
            evaluatedAt: nowIso,
          });
          continue;
        }
      }
      escalatePosts.push(post);
      escalateEmbeddings.push(emb);
    }

    const escalatedVerdicts =
      escalatePosts.length === 0
        ? []
        : (await judgeBatchWithWorkersAi(env, escalatePosts, profile, mergedHistory)) ??
          escalatePosts.map((p, idx) =>
            evaluateWithLocalRubric(
              p,
              profile,
              mergedHistory,
              nowIso,
              escalateEmbeddings[idx] ?? undefined,
            ),
          );

    const escalatedById = new Map(escalatedVerdicts.map((v) => [v.postId, v]));
    const freshVerdicts = uncached
      .map((p) => fastVerdicts.get(p.id) ?? escalatedById.get(p.id))
      .filter((v): v is JudgeVerdict => Boolean(v));

    const cacheStmt = env.DB.prepare(
      `INSERT INTO judge_cache (post_id, profile_rev, verdict_json, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(post_id) DO UPDATE SET
         profile_rev = excluded.profile_rev,
         verdict_json = excluded.verdict_json,
         created_at = excluded.created_at`,
    );
    await env.DB.batch(
      freshVerdicts.map((v) =>
        cacheStmt.bind(v.postId, profile.revision, JSON.stringify(v), nowIso),
      ),
    );

    for (const v of freshVerdicts) {
      cachedById.set(v.postId, v);
    }
  }

  return jsonResponse(request, {
    verdicts: posts.map((p) => cachedById.get(p.id)).filter(Boolean),
  });
}

async function handleReflectTaste(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const body = await readBoundedJson<{
    profile?: TuningProfile;
    feedbackHistory?: FeedbackEvent[];
  }>(request);

  const profile = ensureProfileDefaults(body.profile);
  const history = Array.isArray(body.feedbackHistory)
    ? body.feedbackHistory.slice(0, 60)
    : [];

  if (env.AI && history.length > 0) {
    try {
      const compact = history.map((e) => ({
        action: e.action,
        tag: e.reasonTag,
        author: `@${e.authorHandle}`,
        snippet: e.postSnippet?.slice(0, 160),
      }));
      const aiResp = await env.AI.run(WORKERS_AI_JUDGE_MODEL, {
        messages: [
          {
            role: "system",
            content:
              'Distill the user\'s X feed feedback into 3-8 concise, actionable bullet rules capturing what they consider genuine value (insights, counterpoints, casual posts) vs engagement farming. Return ONLY JSON: {"learnedRules":["..."]}.',
          },
          {
            role: "user",
            content: `Current philosophy: ${profile.tasteProfile.philosophy}\nRecent feedback:\n${JSON.stringify(compact)}`,
          },
        ],
        max_tokens: 400,
        temperature: 0.2,
      });
      const text =
        typeof aiResp.response === "string"
          ? aiResp.response
          : JSON.stringify(aiResp);
      const parsed = extractJsonObject(text);
      if (Array.isArray(parsed?.learnedRules)) {
        const cleaned = parsed.learnedRules
          .map((r) => String(r).trim())
          .filter((r) => r.length >= 8)
          .slice(0, 10);
        if (cleaned.length > 0) {
          return jsonResponse(request, {
            learnedRules: cleaned,
            source: "workers-ai",
          });
        }
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "warn",
          message: "workers-ai reflect fallback triggered",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  const learnedRules = distillTasteRulesLocally(
    history,
    profile.tasteProfile.learnedRules,
  );
  return jsonResponse(request, {
    learnedRules,
    source: "local-distiller",
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/v1/health" && request.method === "GET") {
        return jsonResponse(request, { ok: true, service: "xfeed-sync" });
      }

      const authed = await verifyBearerToken(request, env.SYNC_API_TOKEN);
      if (!authed) {
        return jsonResponse(request, { error: "Unauthorized" }, 401);
      }

      if (url.pathname === "/v1/state" && request.method === "GET") {
        return await handleGetState(request, env, url);
      }
      if (url.pathname === "/v1/profile" && request.method === "PUT") {
        return await handlePutProfile(request, env);
      }
      if (url.pathname === "/v1/feedback/batch" && request.method === "POST") {
        return await handlePostFeedbackBatch(request, env);
      }
      if (url.pathname === "/v1/judge" && request.method === "POST") {
        return await handleJudgePosts(request, env);
      }
      if (url.pathname === "/v1/reflect" && request.method === "POST") {
        return await handleReflectTaste(request, env);
      }

      return jsonResponse(request, { error: "Not found" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse(request, { error: error.message }, error.status);
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        JSON.stringify({
          level: "error",
          message: "unhandled worker error",
          path: url.pathname,
          error: message,
        }),
      );
      return jsonResponse(request, { error: "Internal server error" }, 500);
    }
  },
};
