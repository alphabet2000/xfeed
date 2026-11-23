# xfeed-sync (Cloudflare Workers + D1 — \$0/month Remote Sync)

Lightweight single-user sync backend that keeps your `TuningProfile` and `FeedbackEvent` log synced across your Desktop Extension and Native Android app.

## Local Dev Server (Zero Setup)

Run the built-in Node.js local server (implements the exact same API as the Cloudflare Worker):

```bash
SYNC_API_TOKEN="my-secret-token" node apps/sync-worker/dev-server.mjs
```

- Desktop Extension endpoint: `http://127.0.0.1:8787`
- Android Emulator endpoint: `http://10.0.2.2:8787`

## Deploy to Cloudflare Workers + D1 (\$0 Free Tier)

1. Install Wrangler (requires `npm` / `npx`):
   ```bash
   cd apps/sync-worker
   npx wrangler login
   ```
2. Create the free D1 SQLite database and copy its `database_id` into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create xfeed-sync
   ```
3. Apply the schema, set your personal Bearer token secret, and deploy:
   ```bash
   npx wrangler d1 execute xfeed-sync --remote --file=./schema.sql
   npx wrangler secret put SYNC_API_TOKEN
   npx wrangler deploy
   ```
4. Paste your deployed Worker URL (`https://xfeed-sync.<your-subdomain>.workers.dev`) and the same `SYNC_API_TOKEN` into both the Desktop Extension popup and the Android Tuning Drawer.
