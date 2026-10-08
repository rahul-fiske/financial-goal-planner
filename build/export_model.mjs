#!/usr/bin/env node
/* Everything the workbook generator needs, from the ONE engine:
     node build/export_model.mjs <plan.json|sample> > model.json
   The plan is normalised exactly as the page does it (merge → normalize), so
   build_xlsx.py never re-implements the schema; it only lays out formulas.
   Also carries the projection (the parity reference) and the figures that
   cannot be native formulas: the required-corpus curve and the solvers. */
import fs from "node:fs";
import { merge, defaultState, A } from "../src/schema/plan.mjs";
import { parsePlanText } from "../src/schema/file.mjs";
import { ensureEstimate } from "../src/schema/history.mjs";
import { model, requiredCurve, reqEndFor } from "../src/engine/index.mjs";

const arg = process.argv[2];
if (!arg){ console.error("usage: export_model.mjs <plan.json|sample>"); process.exit(2); }
const raw = arg === "sample" ? defaultState() : parsePlanText(fs.readFileSync(arg, "utf8"));
const r = merge(raw);
if (!r.ok){ console.error("not a plan: " + r.error); process.exit(1); }
const s = r.state;
ensureEstimate(s);

const M = model(s);
const req = requiredCurve(s, M.proj);
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

process.stdout.write(JSON.stringify({
  version: "v" + pkg.version,
  generatedAt: new Date().toISOString(),
  source: arg === "sample" ? "sample plan" : arg.split("/").pop(),
  state: s,
  derived: {retYear: A.retYear(s), endYear: A.endYear(s)},
  years: M.proj.years,
  m: M.proj.m,
  goalStatus: M.proj.goalStatus,
  fix: M.fix,
  required: req,
  requiredEnd: reqEndFor(M.proj.years, req)
}, null, 1));
