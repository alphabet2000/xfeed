import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  distillTasteRulesLocally,
  ensureProfileDefaults,
  evaluateWithLocalRubric,
  trainModelFromFeedback,
} from "../../packages/engine/src/index.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const PLAYGROUND_DIR = path.join(ROOT, "apps/playground");
const BUNDLE_PATH = path.join(
  ROOT,
  "apps/android/app/src/main/assets/xfeed/webview-bundle.js",
);

const PORT = Number(process.env.PORT ?? 4173);
const API_TOKEN = process.env.SYNC_API_TOKEN ?? "playground-token";

const store = {
  profile: null,
  feedbackById: new Map(),
  judgeCache: new Map(),
};

function timingSafeMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 512 * 1024) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-XFeed-Device",
  });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-XFeed-Device",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  try {
    if (url.pathname === "/v1/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, service: "xfeed-playground-sync" });
      return;
    }

    if (url.pathname.startsWith("/v1/")) {
      const auth = req.headers.authorization ?? "";
      const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (!timingSafeMatch(provided, API_TOKEN)) {
        sendJson(res, 401, { error: "Unauthorized" });
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
        sendJson(res, 200, {
          profile,
          feedback: events.slice(0, 1000),
          learnedModel,
          serverTime: new Date().toISOString(),
        });
        return;
      }

      if (url.pathname === "/v1/profile" && req.method === "PUT") {
        const body = await readJson(req);
        const incoming = body.profile;
        if (!incoming || incoming.version !== 1) {
          sendJson(res, 400, { error: "Invalid profile" });
          return;
        }
        if (store.profile && incoming.revision < store.profile.revision) {
          sendJson(res, 200, { accepted: false, profile: store.profile });
          return;
        }
        store.profile = ensureProfileDefaults(incoming);
        sendJson(res, 200, { accepted: true, profile: store.profile });
        return;
      }

      if (url.pathname === "/v1/feedback/batch" && req.method === "POST") {
        const body = await readJson(req);
        const events = Array.isArray(body.events) ? body.events : [];
        let inserted = 0;
        for (const ev of events) {
          if (ev.id && !store.feedbackById.has(ev.id)) {
            store.feedbackById.set(ev.id, ev);
            inserted += 1;
          }
        }
        sendJson(res, 200, { inserted });
        return;
      }

      if (url.pathname === "/v1/judge" && req.method === "POST") {
        const body = await readJson(req);
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

        sendJson(res, 200, { verdicts });
        return;
      }

      if (url.pathname === "/v1/reflect" && req.method === "POST") {
        const body = await readJson(req);
        const profile = ensureProfileDefaults(body.profile ?? store.profile);
        const history = Array.isArray(body.feedbackHistory)
          ? body.feedbackHistory
          : Array.from(store.feedbackById.values());

        const learnedRules = distillTasteRulesLocally(
          history,
          profile.tasteProfile.learnedRules,
        );
        sendJson(res, 200, { learnedRules, source: "local-distiller" });
        return;
      }

      sendJson(res, 404, { error: "Not found" });
      return;
    }

    if (url.pathname === "/styles.css") {
      serveFile(res, path.join(PLAYGROUND_DIR, "styles.css"), "text/css; charset=utf-8");
      return;
    }
    if (url.pathname === "/playground.js") {
      serveFile(res, path.join(PLAYGROUND_DIR, "playground.js"), "application/javascript; charset=utf-8");
      return;
    }
    if (url.pathname === "/xfeed-bundle.js") {
      serveFile(res, BUNDLE_PATH, "application/javascript; charset=utf-8");
      return;
    }

    // SPA fallback so /home, /<author>, /<author>/status/<id>, and /hashtag/<tag> all work cleanly
    if (req.method === "GET") {
      serveFile(res, path.join(PLAYGROUND_DIR, "index.html"), "text/html; charset=utf-8");
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (err) {
    sendJson(res, err?.status ?? 500, { error: err?.message ?? "Internal error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[xfeed-playground] Ready at http://127.0.0.1:${PORT}/home (sync token: ${API_TOKEN})`);
});
