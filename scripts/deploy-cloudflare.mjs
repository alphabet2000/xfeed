import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WORKER_NAME = process.env.WORKER_NAME ?? "xfeed-sync";
const DB_NAME = process.env.D1_DB_NAME ?? "xfeed-sync";
const LOCAL_STATE_FILE = path.join(ROOT, ".cloudflare-sync.local.json");
const API_BASE = "https://api.cloudflare.com/client/v4";

const apiToken = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
if (!apiToken) {
  console.error(
    [
      "Missing CLOUDFLARE_API_TOKEN.",
      "",
      "1. Create a token at: https://dash.cloudflare.com/profile/api-tokens",
      '   - Start from the "Edit Cloudflare Workers" template',
      "   - Add Account permission: D1 -> Edit",
      "2. Run:",
      '   CLOUDFLARE_API_TOKEN="your-token-here" node scripts/deploy-cloudflare.mjs',
    ].join("\n"),
  );
  process.exit(1);
}

async function cfRequest(method, apiPath, body) {
  const headers = { Authorization: `Bearer ${apiToken}` };
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${apiPath}`, {
    method,
    headers,
    body: payload,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const details = JSON.stringify(json.errors ?? json, null, 2);
    throw new Error(`Cloudflare API ${method} ${apiPath} failed (${res.status}):\n${details}`);
  }
  return json.result;
}

function loadSavedLocalState() {
  if (!fs.existsSync(LOCAL_STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  // 1. Rebuild latest standalone worker bundle
  console.log("1/6 Building standalone worker bundle...");
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build.mjs")], {
    stdio: "inherit",
  });
  const workerBundlePath = path.join(ROOT, "apps/sync-worker/dist/worker.mjs");
  const workerCode = fs.readFileSync(workerBundlePath, "utf8");
  const schemaSql = fs.readFileSync(path.join(ROOT, "apps/sync-worker/schema.sql"), "utf8");

  // 2. Discover account ID
  console.log("2/6 Checking Cloudflare account...");
  let accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  if (!accountId) {
    const accounts = await cfRequest("GET", "/accounts");
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error("No Cloudflare accounts accessible with this token.");
    }
    accountId = accounts[0].id;
    console.log(`    Using account: ${accounts[0].name} (${accountId})`);
  }

  // 3. Find or create free D1 database
  console.log(`3/6 Ensuring D1 database "${DB_NAME}" exists...`);
  const existingDbs = await cfRequest("GET", `/accounts/${accountId}/d1/database`);
  let db = (existingDbs ?? []).find((d) => d.name === DB_NAME);
  if (!db) {
    db = await cfRequest("POST", `/accounts/${accountId}/d1/database`, { name: DB_NAME });
    console.log(`    Created D1 database: ${db.uuid}`);
  } else {
    console.log(`    Found existing D1 database: ${db.uuid}`);
  }
  const dbId = db.uuid;

  // 4. Apply schema.sql (and safe ALTER for existing tables if upgrading)
  console.log("4/6 Applying D1 schema...");
  await cfRequest("POST", `/accounts/${accountId}/d1/database/${dbId}/query`, {
    sql: schemaSql,
  });

  // 5. Choose or reuse personal SYNC_API_TOKEN & upload Worker + bindings
  const saved = loadSavedLocalState();
  const syncApiToken =
    (process.env.SYNC_API_TOKEN ?? "").trim() ||
    saved.syncApiToken ||
    `xfeed_${crypto.randomBytes(24).toString("hex")}`;

  console.log(`5/6 Deploying Worker "${WORKER_NAME}" with D1 + Workers AI bindings...`);
  const metadata = {
    main_module: "worker.mjs",
    compatibility_date: "2026-11-23",
    observability: {
      enabled: true,
      traces: { enabled: true },
    },
    bindings: [
      { type: "d1", name: "DB", id: dbId, database_id: dbId },
      { type: "ai", name: "AI" },
      { type: "secret_text", name: "SYNC_API_TOKEN", text: syncApiToken },
    ],
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append(
    "worker.mjs",
    new Blob([workerCode], { type: "application/javascript+module" }),
    "worker.mjs",
  );

  await cfRequest("PUT", `/accounts/${accountId}/workers/scripts/${WORKER_NAME}`, form);

  // 6. Enable workers.dev subdomain & verify /v1/health
  console.log("6/6 Enabling workers.dev route & verifying...");
  await cfRequest(
    "POST",
    `/accounts/${accountId}/workers/scripts/${WORKER_NAME}/subdomain`,
    { enabled: true },
  );

  const subInfo = await cfRequest("GET", `/accounts/${accountId}/workers/subdomain`);
  const subdomain = subInfo?.subdomain;
  const workerUrl = subdomain
    ? `https://${WORKER_NAME}.${subdomain}.workers.dev`
    : `https://${WORKER_NAME}.<your-subdomain>.workers.dev`;

  fs.writeFileSync(
    LOCAL_STATE_FILE,
    JSON.stringify({ accountId, dbId, workerUrl, syncApiToken }, null, 2),
    "utf8",
  );

  if (subdomain) {
    try {
      const health = await fetch(`${workerUrl}/v1/health`).then((r) => r.json());
      console.log("    Health check:", JSON.stringify(health));
    } catch (e) {
      console.log("    Note: new workers.dev route may take ~10-30s to propagate:", e.message);
    }
  }

  console.log("\n========================================================");
  console.log("xfeed-sync deployed ($0 Cloudflare Free Tier)!");
  console.log(`Sync Endpoint URL : ${workerUrl}`);
  console.log(`SYNC_API_TOKEN    : ${syncApiToken}`);
  console.log("========================================================");
  console.log("Paste both into your Desktop Extension popup and Android Tuning Sheet.");
}

main().catch((err) => {
  console.error("\nDeploy failed:", err.message);
  process.exit(1);
});
