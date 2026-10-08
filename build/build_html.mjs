#!/usr/bin/env node
/* Builds the single-file page from src/.
     index.html   the one file: open it from disk, or serve it as-is
                  (GitHub Pages serves it from the repo root)
   The modules are concatenated in dependency order into ONE scope inside an
   IIFE: `import` lines are dropped and `export` keywords stripped. Every step
   is asserted — a duplicate top-level name, a leftover import/export, or a
   stray "</script" fails the build rather than shipping. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const VERSION = "v" + pkg.version;

const ORDER = [
  "src/schema/util.mjs", "src/schema/plan.mjs", "src/schema/file.mjs", "src/schema/history.mjs",
  "src/engine/project.mjs", "src/engine/track.mjs", "src/engine/required.mjs",
  "src/engine/solvers.mjs", "src/engine/attribution.mjs",
  "src/ui/format.js", "src/storage/files.js",
  "src/ui/charts.js", "src/ui/panels.js", "src/ui/render.js",
  "src/ui/snapshots.js", "src/ui/events.js", "src/ui/app.js"
];

const FONT_LINKS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@600&display=swap">'
].join("\n");

function fail(msg){ console.error("BUILD FAILED: " + msg); process.exit(1); }

const seen = new Map();
const parts = [];
for (const rel of ORDER){
  let src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  src = src.replace(/^import\s[^\n]*\n/gm, "");
  src = src.replace(/^export\s*\{[^}]*\}\s*from[^\n]*\n/gm, "");
  src = src.replace(/^export\s+(?=(?:async\s+)?function|const|let|class)/gm, "");
  if (/^\s*(import|export)\s/m.test(src)) fail(`${rel}: an import/export survived`);
  for (const m of src.matchAll(/^(?:async\s+)?function\s+([\w$]+)|^(?:const|let|var|class)\s+([\w$]+)/gm)){
    const name = m[1] || m[2];
    if (seen.has(name)) fail(`top-level "${name}" defined in both ${seen.get(name)} and ${rel}`);
    seen.set(name, rel);
  }
  parts.push(`/* ---- ${rel} ---- */\n` + src.trim() + "\n");
}

let js = `(function(){\n"use strict";\n`
       + parts.join("\n") + "})();\n";
js = js.replace("__BUILD_VERSION__", VERSION);
if (/<\/script/i.test(js)) fail('the bundle contains "</script"');
if (/localStorage|sessionStorage|indexedDB/.test(js.replace(/\/\*[\s\S]*?\*\//g, "")))
  fail("the bundle touches browser storage; the plan must live only in memory and in the file");

const css = fs.readFileSync(path.join(ROOT, "src/theme/style.css"), "utf8");
if (/<\/style/i.test(css)) fail('the stylesheet contains "</style"');

const body = `<style id="gp-style">\n${css}</style>\n<div id="gp-root"></div>\n<script id="gp-app">\n${js}</script>\n`;
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n`
  + `<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Financial Goal Planner</title>\n`
  + FONT_LINKS + "\n</head>\n<body>\n" + body + "</body>\n</html>\n";

fs.writeFileSync(path.join(ROOT, "index.html"), full);
console.log(`built ${VERSION}: index.html ${(full.length/1024).toFixed(0)} KB, `
  + `${seen.size} top-level names, ${ORDER.length} modules`);
