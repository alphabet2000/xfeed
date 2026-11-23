import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/**
 * Lightweight zero-dependency ES module bundler for local TS/JS files using Node 26's
 * built-in `stripTypeScriptTypes`. Resolves relative imports into a single browser-ready IIFE.
 */
function bundleEntry(entryFile, outFile, { banner = "" } = {}) {
  const visited = new Set();
  const ordered = [];

  function resolveFile(fromFile, specifier) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [base, `${base}.ts`, `${base}.js`, path.join(base, "index.ts")];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    throw new Error(`Cannot resolve import "${specifier}" from ${fromFile}`);
  }

  function visit(filePath) {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    const raw = fs.readFileSync(filePath, "utf8");
    const js = filePath.endsWith(".ts")
      ? stripTypeScriptTypes(raw, { mode: "strip" })
      : raw;

    // Collect local imports & re-exports
    const importRegex =
      /^(?:import\s+(?:[\s\S]*?\s+from\s+)?|export\s+(?:\*|\{[\s\S]*?\})\s+from\s+)["'](\.[^"']+)["'];?/gm;

    let match;
    const deps = [];
    while ((match = importRegex.exec(js)) !== null) {
      deps.push(match[1]);
    }
    for (const dep of deps) {
      visit(resolveFile(filePath, dep));
    }

    // Strip import statements & export keywords so all symbols share the IIFE scope cleanly
    let transformed = js
      .replace(
        /^\s*import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["'][^"']+["'];?\s*$/gm,
        "",
      )
      .replace(
        /^\s*export\s+\*\s+from\s+["'][^"']+["'];?\s*$/gm,
        "",
      )
      .replace(
        /^\s*export\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];?\s*$/gm,
        "",
      )
      .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, "")
      .replace(/^\s*export\s+default\s+/gm, "")
      .replace(/^\s*export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, "");

    const rel = path.relative(ROOT, filePath);
    ordered.push(`// --- ${rel} ---\n${transformed.trim()}\n`);
  }

  visit(entryFile);

  const output = `${banner}(() => {\n"use strict";\n\n${ordered.join("\n")}\n})();\n`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, output, "utf8");
  console.log(`Built ${path.relative(ROOT, outFile)} (${(output.length / 1024).toFixed(1)} KB)`);
}

function bundleWorkerEsm(entryFile, outFile) {
  const visited = new Set();
  const ordered = [];

  function resolveFile(fromFile, specifier) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [base, `${base}.ts`, `${base}.js`, path.join(base, "index.ts")];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    throw new Error(`Cannot resolve import "${specifier}" from ${fromFile}`);
  }

  function visit(filePath) {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    const raw = fs.readFileSync(filePath, "utf8");
    const js = filePath.endsWith(".ts")
      ? stripTypeScriptTypes(raw, { mode: "strip" })
      : raw;

    const importRegex =
      /^(?:import\s+(?:[\s\S]*?\s+from\s+)?|export\s+(?:\*|\{[\s\S]*?\})\s+from\s+)["'](\.[^"']+)["'];?/gm;

    let match;
    const deps = [];
    while ((match = importRegex.exec(js)) !== null) {
      deps.push(match[1]);
    }
    for (const dep of deps) {
      visit(resolveFile(filePath, dep));
    }

    const isEntry = filePath === entryFile;
    let transformed = js
      .replace(
        /^\s*import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["'][^"']+["'];?\s*$/gm,
        "",
      )
      .replace(/^\s*export\s+\*\s+from\s+["'][^"']+["'];?\s*$/gm, "")
      .replace(/^\s*export\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];?\s*$/gm, "")
      .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, "")
      .replace(/^\s*export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, "");

    if (!isEntry) {
      transformed = transformed.replace(/^\s*export\s+default\s+/gm, "");
    }

    const rel = path.relative(ROOT, filePath);
    ordered.push(`// --- ${rel} ---\n${transformed.trim()}\n`);
  }

  visit(entryFile);
  const output = `/* xfeed Cloudflare Worker Standalone ESM Bundle */\n${ordered.join("\n")}\n`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, output, "utf8");
  console.log(`Built ${path.relative(ROOT, outFile)} (${(output.length / 1024).toFixed(1)} KB)`);
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const targets = [
  {
    entry: path.join(ROOT, "apps/extension/src/content.ts"),
    out: path.join(ROOT, "apps/extension/dist/content.js"),
    banner: "/* xfeed Desktop Extension Content Script */\n",
  },
  {
    entry: path.join(ROOT, "apps/extension/src/background.ts"),
    out: path.join(ROOT, "apps/extension/dist/background.js"),
    banner: "/* xfeed Desktop Extension Background Sync Worker */\n",
  },
  {
    entry: path.join(ROOT, "apps/extension/src/popup/popup.ts"),
    out: path.join(ROOT, "apps/extension/dist/popup.js"),
    banner: "/* xfeed Desktop Extension Popup */\n",
  },
  {
    entry: path.join(ROOT, "apps/android/web-entry/webview-entry.ts"),
    out: path.join(ROOT, "apps/android/app/src/main/assets/xfeed/webview-bundle.js"),
    banner: "/* xfeed Android WebView Injected Bundle */\n",
  },
];

let builtCount = 0;
for (const t of targets) {
  if (fs.existsSync(t.entry)) {
    bundleEntry(t.entry, t.out, { banner: t.banner });
    builtCount += 1;
  }
}

copyIfExists(
  path.join(ROOT, "apps/extension/manifest.json"),
  path.join(ROOT, "apps/extension/dist/manifest.json"),
);
copyIfExists(
  path.join(ROOT, "apps/extension/src/popup/popup.html"),
  path.join(ROOT, "apps/extension/dist/popup.html"),
);
copyIfExists(
  path.join(ROOT, "apps/extension/src/popup/popup.css"),
  path.join(ROOT, "apps/extension/dist/popup.css"),
);

const workerEntry = path.join(ROOT, "apps/sync-worker/src/worker.ts");
if (fs.existsSync(workerEntry)) {
  bundleWorkerEsm(workerEntry, path.join(ROOT, "apps/sync-worker/dist/worker.mjs"));
  builtCount += 1;
}

console.log(`Done (${builtCount} bundles compiled).`);
