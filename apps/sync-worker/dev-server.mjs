import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  distillTasteRulesLocally,
  ensureProfileDefaults,
  evaluateWithLocalRubric,
  trainModelFromFeedback,
} from "../../packages/engine/src/index.ts";

const MAX_BODY_BYTES = 512 * 1024;
const MAX_FEEDBACK_BATCH = 200;

function timingSafeMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function loadStore(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return { profile: null, feedbackById: new Map(), judgeCache: new Map() };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    const map = new Map();
    for (const ev of raw.feedback ?? []) {
      map.set(ev.id, ev);
    }
    return { profile: raw.profile ?? null, feedbackById: map, judgeCache: new Map() };
  } catch {
    return { profile: null, feedbackById: new Map(), judgeCache: new Map() };
  }
}

function saveStore(dbPath, store) {
  if (!dbPath) return;
  const payload = {
    profile: store.profile,
    feedback: Array.from(store.feedbackById.values()),
  };
  fs.writeFileSync(dbPath, JSON.stringify(payload, null, 2), "utf8");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text));
      } catch {
        reject(Object.assign(new Error("Invalid JSON payload"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

export function createLocalSyncServer({ apiToken, dbPath = null }) {
  const store = loadStore(dbPath);

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin ?? "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-XFeed-Device",
      Vary: "Origin",
    };

    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        ...cors,
      });
      res.end(JSON.stringify(data));
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    try {
      if (url.pathname === "/v1/health" && req.method === "GET") {
        send(200, { ok: true, service: "xfeed-sync-local" });
        return;
      }

      const auth = req.headers.authorization ?? "";
      const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (!timingSafeMatch(provided, apiToken)) {
        send(401, { error: "Unauthorized" });
        return;
      }

      if (url.pathname === "/v1/state" && req.method === "GET") {
        const since = url.searchParams.get("since");
        const allEvents = Array.from(store.feedbackById.values()).sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
        const learnedModel = trainModelFromFeedback(
          allEvents,
          store.profile?.learnedModel?.scorerWeights,
        );
        const profile = store.profile
          ? { ...ensureProfileDefaults(store.profile), learnedModel }
          : null;
        const events = since
          ? allEvents.filter((e) => e.createdAt > since)
          : allEvents;
        send(200, {
          profile,
          feedback: events.slice(0, 1000),
          learnedModel,
          serverTime: new Date().toISOString(),
        });
        return;
      }

      if (url.pathname === "/v1/profile" && req.method === "PUT") {
        const body = await readJsonBody(req);
        const incoming = body.profile;
        if (
          !incoming ||
          incoming.version !== 1 ||
          typeof incoming.revision !== "number" ||
          typeof incoming.updatedAt !== "string"
        ) {
          send(400, { error: "Invalid profile payload" });
          return;
        }
        if (store.profile) {
          const isStale =
            incoming.revision < store.profile.revision ||
            (incoming.revision === store.profile.revision &&
              Date.parse(incoming.updatedAt) < Date.parse(store.profile.updatedAt));
          if (isStale) {
            send(200, { accepted: false, profile: store.profile });
            return;
          }
        }
        store.profile = ensureProfileDefaults(incoming);
        saveStore(dbPath, store);
        send(200, { accepted: true, profile: store.profile });
        return;
      }

      if (url.pathname === "/v1/feedback/batch" && req.method === "POST") {
        const body = await readJsonBody(req);
        if (!Array.isArray(body.events)) {
          send(400, { error: "events array is required" });
          return;
        }
        if (body.events.length > MAX_FEEDBACK_BATCH) {
          send(400, { error: `Maximum ${MAX_FEEDBACK_BATCH} events per batch` });
          return;
        }
        let inserted = 0;
        for (const ev of body.events) {
          if (!ev.id || !ev.postId || !ev.action || !ev.createdAt) {
            send(400, { error: "Invalid feedback event fields" });
            return;
          }
          if (!store.feedbackById.has(ev.id)) {
            store.feedbackById.set(ev.id, ev);
            inserted += 1;
          }
        }
        saveStore(dbPath, store);
        send(200, { inserted });
        return;
      }

      if (url.pathname === "/v1/judge" && req.method === "POST") {
        const body = await readJsonBody(req);
        const posts = Array.isArray(body.posts) ? body.posts.slice(0, 12) : [];
        const profile = ensureProfileDefaults(body.profile ?? store.profile);
        const history = Array.isArray(body.feedbackHistory)
          ? body.feedbackHistory
          : Array.from(store.feedbackById.values());

        const verdicts = posts.map((post) => {
          const cacheKey = `${post.id}:${profile.revision}`;
          const cached = store.judgeCache.get(cacheKey);
          if (cached) return { ...cached, source: "cache" };
          const verdict = evaluateWithLocalRubric(post, profile, history);
          store.judgeCache.set(cacheKey, verdict);
          return verdict;
        });

        send(200, { verdicts });
        return;
      }

      if (url.pathname === "/v1/reflect" && req.method === "POST") {
        const body = await readJsonBody(req);
        const profile = ensureProfileDefaults(body.profile ?? store.profile);
        const history = Array.isArray(body.feedbackHistory)
          ? body.feedbackHistory
          : Array.from(store.feedbackById.values());

        const learnedRules = distillTasteRulesLocally(
          history,
          profile.tasteProfile.learnedRules,
        );
        send(200, { learnedRules, source: "local-distiller" });
        return;
      }

      send(404, { error: "Not found" });
    } catch (error) {
      const status = typeof error?.status === "number" ? error.status : 500;
      send(status, { error: error instanceof Error ? error.message : "Internal error" });
    }
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const apiToken = process.env.SYNC_API_TOKEN ?? "dev-local-token";
  const dbPath =
    process.env.SYNC_DB_PATH ??
    path.resolve(path.dirname(new URL(import.meta.url).pathname), ".local-sync-db.json");

  const server = createLocalSyncServer({ apiToken, dbPath });
  server.listen(port, "0.0.0.0", () => {
    console.log(
      `[xfeed-sync-local] Listening on http://127.0.0.1:${port} (token: ${apiToken})`,
    );
  });
}
