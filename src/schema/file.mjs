/* goal_plan.json — reading and writing the data file.

   Written: strict JSON, 2-space indent, stable key order with schemaVersion
   first, money as plain integer rupees. Read: that, or a legacy plan.js
   carrying `window.PLAN = {…}` (migration only; .js is never written).

   Holdings are written in withdraw-priority order, ties by id — the same
   order the engine uses, so the file reads the way the money is drawn.
   Goals keep their order; history is written by year. */

import { byWithdrawOrder } from "./plan.mjs";

const KEY_ORDER = {
  root:  ["schemaVersion", "v", "savedAt", "a", "investments", "goals", "history"],
  a:     ["asOf", "currentYear", "currentAge", "retirementAge", "lifeExpectancy",
          "postRetReturn", "usePostRet", "cgExempt", "rolledThrough", "liveYear", "noEstimate"],
  inv:   ["id", "name", "cat", "owner", "val", "cost", "add", "step", "ret",
          "until", "avail", "pri", "on", "taxWhen", "taxRate"],
  goal:  ["id", "name", "kind", "start", "end", "amt", "infl", "ess", "on", "isRet"],
  hist:  ["id", "year", "actual", "contribution", "estimated", "note", "snaps"],
  snap:  ["id", "date", "total", "added", "note", "byInv"]
};
const MONEY = {
  inv: ["val", "cost", "add"], goal: ["amt"], hist: ["actual", "contribution"],
  snap: ["total", "added"], a: ["cgExempt"]
};

function ordered(obj, keys, money){
  const out = {};
  for (const k of keys) if (k in obj && obj[k] !== undefined) out[k] = obj[k];
  /* anything unknown is kept, after the known keys, alphabetically — a newer
     field must never be dropped by an older writer */
  Object.keys(obj).filter(k => !keys.includes(k)).sort()
    .forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  for (const k of (money || [])) if (typeof out[k] === "number") out[k] = Math.round(out[k]);
  return out;
}

export function toFileObject(state){
  const r = ordered(state, KEY_ORDER.root);
  r.a = ordered(state.a, KEY_ORDER.a, MONEY.a);
  r.investments = state.investments.slice().sort(byWithdrawOrder).map(i => ordered(i, KEY_ORDER.inv, MONEY.inv));
  r.goals = state.goals.map(g => ordered(g, KEY_ORDER.goal, MONEY.goal));
  r.history = state.history.slice().sort((x, y) => x.year - y.year).map(h => {
    const o = ordered(h, KEY_ORDER.hist, MONEY.hist);
    o.snaps = (h.snaps || []).map(sn => {
      const s = ordered(sn, KEY_ORDER.snap, MONEY.snap);
      if (s.byInv){
        const b = {};
        Object.keys(s.byInv).sort().forEach(k => b[k] = Math.round(s.byInv[k]));
        s.byInv = b;
      }
      return s;
    });
    return o;
  });
  return r;
}

export function serialiseJson(state){
  return JSON.stringify(toFileObject(state), null, 2) + "\n";
}

/* Read a plan out of whatever was handed over: goal_plan.json, or a legacy
   plan.js. The wrapper is peeled deliberately rather than by hunting for the
   first "=" or "{", either of which a comment could contain. */
export function parsePlanText(text){
  let t = String(text).replace(/^﻿/, "").trim();
  t = t.replace(/^\/\*[\s\S]*?\*\//, "").trim();
  while (/^\/\//.test(t)) t = t.replace(/^\/\/[^\n]*\n?/, "").trim();
  t = t.replace(/^(?:window\s*\.\s*)?[\w$]+\s*=\s*/, "");   // window.PLAN = / window.GOAL_PLAN =
  t = t.replace(/;\s*$/, "");
  return JSON.parse(t);
}

/* Backup names: goal_plan_<YYYYMMDD-HHMMSS>.json, sortable, never localised. */
export function backupName(d){
  const p = n => String(n).padStart(2, "0");
  return "goal_plan_" + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate())
       + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".json";
}
