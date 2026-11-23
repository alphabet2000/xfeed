# xfeed

A personal, customizable X feed platform (**\$0 X API cost**) built on one shared TypeScript **Customization Engine** and **`x.com` DOM Adapter**, powering:

- **Desktop Browser Extension (Manifest V3)** — Chrome, Brave, Edge
- **Native Android WebView App** — Kotlin + Jetpack Compose + Material 3
- **\$0/month Cloud Sync & AI Learning Backend** — Cloudflare Workers + D1 SQLite + Workers AI
- **Interactive Local Playground** — full mock `x.com` DOM with posts, replies, profiles, hashtags, and live tuning controls

> **Disclaimer:** Unofficial, independent personal-use project. Not affiliated with, endorsed by, or sponsored by X Corp. `xfeed` does not use the X API, does not bundle X proprietary assets, does not perform automated scraping, and never handles your X login credentials—you sign in directly on `x.com` inside your browser or WebView.

---

## Features

- **Zero X API Cost:** Runs client-side on top of `https://x.com` in your browser or Android `WebView` with persistent cookies.
- **Decoupled Post vs. Author Controls:**
  - **👎 Downvote** — post-level negative signal (for engagement farming, tone, or taste) that **does not punish the author's other posts** and optionally triggers X's native *"Not interested in this post"* menu item (hiding X's confirmation banners cleanly).
  - **👍 Upvote** — post-level positive signal (informative insight, brief counterpoint, or authentic casual post).
  - **🔁 Seen 24h** — temporary 24-hour story snooze (matched by semantic embedding + key terms) so repeated breaking-news posts disappear for the rest of the day **without** poisoning your long-term taste model.
  - **✓ Keep (Wrong filter)** — appears after clicking **Show** on a collapsed post to restore it cleanly (not an upvote) and teach the model it made a false positive.
  - **🔇 Less @author** — explicit author-level downranking kept separate from post quality.
- **Multi-Loop Cloud-Synced Taste Learning (\$0 Cloudflare Free Tier):**
  - **Editable Plain-English Feed Philosophy** + **Loop B Taste Reflection** (distills human-readable, editable rules from your feedback).
  - **Loop A AI Taste Judge** — batched, D1-cached **Cloudflare Workers AI** (`@cf/meta/llama-3.2-3b-instruct`) with similar-example retrieval.
  - **Loop C / Speed 1 Online Learner** — conflict-free, time-decayed L2-regularized logistic regression over **384-dim `@cf/baai/bge-small-en-v1.5` embeddings** (plus sparse offline token weights) synced across Desktop and Android.
  - **Automatic 24h Story Deduplication** — collapses near-duplicate headlines already seen today while granting a novelty exception for genuine counterpoints.
- **Clean Desktop Layout:** Optional toggles to hide X's right sidebar and widen the main feed column while keeping embedded media/screenshots at native width.

---

## Repository Structure

```text
xfeed/
├── packages/
│   ├── engine/          # Pure TypeScript customization engine (0 runtime deps)
│   │   └── src/         # types, defaults, learner (384-dim online LR), novelty (24h dedupe),
│   │                    # judge, scorers, pipeline, sync client
│   └── x-adapter/       # Shared x.com DOM observer, extractor, UI renderer, native X feedback bridge
├── apps/
│   ├── extension/       # Desktop Manifest V3 browser extension + popup tuning UI
│   ├── android/         # Native Android Kotlin + Jetpack Compose WebView app
│   ├── sync-worker/     # Cloudflare Workers + D1 + Workers AI ($0 remote sync & judge)
│   └── playground/      # Interactive local mock x.com SPA for development & testing
└── scripts/
    ├── build.mjs            # Zero-dependency TS bundler (uses Node 22+/26 native type stripping)
    └── deploy-cloudflare.mjs # Zero-dependency Cloudflare REST API deploy helper
```

---

## Quick Start

### Prerequisites
- **Node.js 22.18+** (tested on Node 26; zero `npm` dependencies required for core building and testing).
- **Optional (Cloud Sync):** Free Cloudflare account + `npm`/`npx wrangler` (or a Cloudflare API token with `scripts/deploy-cloudflare.mjs`).
- **Optional (Android APK):** JDK 17+ and Android SDK (Platform 35).

### 1. Build All Bundles & Run Automated Tests
```bash
node scripts/build.mjs
node --test packages/engine/test/*.test.ts apps/sync-worker/test/*.test.mjs
```
This builds:
- `apps/extension/dist/` (Desktop Extension)
- `apps/android/app/src/main/assets/xfeed/webview-bundle.js` (Android WebView bundle)
- `apps/sync-worker/dist/worker.mjs` (Standalone Worker bundle)

### 2. Try the Interactive Local Playground
```bash
node apps/playground/server.mjs
```
Open **http://127.0.0.1:4173/home** to test the real compiled `xfeed` bundle against an interactive mock `x.com` timeline (including post detail threads, replies, author profiles, hashtags, two-way native X menu forwarding, and live sync).

### 3. Load the Desktop Browser Extension on `x.com`
1. Run `node scripts/build.mjs`.
2. Open `chrome://extensions` (or `brave://extensions` / `edge://extensions`).
3. Enable **Developer mode** → **Load unpacked** → select `apps/extension/dist`.
4. Visit `https://x.com/home` and sign in normally. Click the **xfeed** toolbar icon to open the Tuning Popup.

### 4. Deploy \$0 Cloud Sync & Workers AI (Cloudflare Free Tier)
Using Wrangler:
```bash
cd apps/sync-worker
npx wrangler login
npx wrangler d1 create xfeed-sync
# Copy your new database_id into wrangler.local.jsonc (gitignored) or wrangler.jsonc
npx wrangler d1 execute xfeed-sync --remote --file=./schema.sql
npx wrangler secret put SYNC_API_TOKEN
npx wrangler deploy
```
Or see [apps/sync-worker/README.md](apps/sync-worker/README.md) and `scripts/deploy-cloudflare.mjs`.

Then paste your Worker URL (`https://xfeed-sync.<your-subdomain>.workers.dev`) and `SYNC_API_TOKEN` into the Desktop Extension popup and Android Tuning Sheet.

### 5. Build the Native Android App
1. Run `node scripts/build.mjs` so `apps/android/app/src/main/assets/xfeed/webview-bundle.js` is generated.
2. Open `apps/android` in Android Studio (JDK 17+, Android SDK 35) and run or assemble the debug APK.

---

## Privacy & Security Hygiene

- Personal sync credentials, local databases, and Wrangler caches are ignored in `.gitignore` (`.cloudflare-sync.local.json`, `.wrangler/`, `wrangler.local.jsonc`, `.env*`, `.local-sync-db.json`).
- The sync Worker verifies `Authorization: Bearer <SYNC_API_TOKEN>` using constant-time SHA-256 comparison (`crypto.subtle.timingSafeEqual`) and enforces bounded request payloads.
- Never commit real `SYNC_API_TOKEN` values, Cloudflare API tokens, or personal D1 database IDs.
