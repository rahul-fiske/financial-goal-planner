/* Plan schema: defaults, normalisation, load-time merge.
   Ported verbatim from the v37 planner page (_archive/v37_reference). Differences from the original
   are structural only (no globals, no DOM):
     - merge() returns {ok, state, error} instead of assigning a global and
       calling notice(); the refusal rule for newer data is unchanged.
     - rollForward() takes the "today" date as an argument.               */
import { uid, clone, num, normDate, asOfYear, systemDate } from "./util.mjs";

export const SCHEMA = 1;

/* Each holding says WHEN its gain is taxed, and at what rate. A rate of 0 is
   how an exempt holding is expressed. Starting points from Indian rules for
   FY 2025-26, editable per holding, not advice. */
export const TAX_WHEN = [
  ["tax_on_withdrawal", "On withdrawal, on the gain"],
  ["tax_at_year_end",   "Every year, on the gain"]
];
export const TAX_DEFAULTS = {
  "Equity":  {when:"tax_on_withdrawal", rate:0.125},
  "EPF-PPF": {when:"tax_on_withdrawal", rate:0},
  "NPS":     {when:"tax_on_withdrawal", rate:0.12},
  "Debt":    {when:"tax_on_withdrawal", rate:0.30},
  "Cash":    {when:"tax_at_year_end",   rate:0.30},
  "Property":{when:"tax_on_withdrawal", rate:0.125},
  "Other":   {when:"tax_on_withdrawal", rate:0}
};
export function taxDefault(cat){ return TAX_DEFAULTS[cat] || TAX_DEFAULTS["Other"]; }
export const CATS = ["Equity","EPF-PPF","NPS","Debt","Cash","Property","Other"];

export const A = {
  retYear: s => s.a.currentYear + (s.a.retirementAge - s.a.currentAge),
  endYear: s => s.a.currentYear + (s.a.lifeExpectancy - s.a.currentAge)
};

/* The sample household: a made-up 38-year-old couple with one child,
   retiring at 58 on 75,000 a month in today's money. Nothing real belongs
   here. Withdraw order runs deposits, equity, PPF, EPF, NPS. */
export function defaultState(){
  return {
    v: 2, schemaVersion: SCHEMA,
    a: {
      currentYear: 2026, currentAge: 38, retirementAge: 58, lifeExpectancy: 85,
      postRetReturn: 0.065, usePostRet: true,
      asOf: "2026-09-12", rolledThrough: 2025, cgExempt: 125000
    },
    investments: [
      {id:"i1", name:"Provident fund (EPF)", cat:"EPF-PPF", owner:"Self",  val:1800000, cost:1800000, add:180000, step:0.05, ret:0.075, until:null, avail:null, pri:4, on:true, taxWhen:"tax_on_withdrawal", taxRate:0},
      {id:"i2", name:"PPF",                  cat:"EPF-PPF", owner:"Self",  val:800000,  cost:800000,  add:150000, step:0,    ret:0.071, until:null, avail:null, pri:3, on:true, taxWhen:"tax_on_withdrawal", taxRate:0},
      {id:"i3", name:"Equity mutual funds",  cat:"Equity",  owner:"Joint", val:2200000, cost:1400000, add:300000, step:0.05, ret:0.105, until:null, avail:null, pri:2, on:true, taxWhen:"tax_on_withdrawal", taxRate:0.125},
      {id:"i4", name:"NPS",                  cat:"NPS",     owner:"Self",  val:600000,  cost:600000,  add:60000,  step:0,    ret:0.09,  until:null, avail:2048, pri:5, on:true, taxWhen:"tax_on_withdrawal", taxRate:0.12},
      {id:"i5", name:"Bank deposits",        cat:"Cash",    owner:"Joint", val:500000,  cost:500000,  add:0,      step:0,    ret:0.06,  until:null, avail:null, pri:1, on:true, taxWhen:"tax_at_year_end",   taxRate:0.30}
    ],
    goals: [
      {id:"g1", name:"New car",             kind:"onetime",   start:2030, end:2030, amt:1200000, infl:0.06, ess:false, on:true, isRet:false},
      {id:"g2", name:"Child's college",     kind:"onetime",   start:2040, end:2040, amt:2500000, infl:0.07, ess:true,  on:true, isRet:false},
      {id:"g3", name:"Retirement expenses", kind:"recurring", start:2046, end:2073, amt:900000,  infl:0.06, ess:true,  on:true, isRet:true}
    ],
    history: [
      {id:"h1", year:2022, actual:2150000, contribution:500000, note:"Started keeping a record", snaps:[]},
      {id:"h2", year:2023, actual:2940000, contribution:550000, note:"", snaps:[]},
      {id:"h3", year:2024, actual:3830000, contribution:600000, note:"Moved the SIP into index funds", snaps:[]},
      {id:"h4", year:2025, actual:4680000, contribution:640000, note:"Flat market year", snaps:[]},
      {id:"h5", year:2026, actual:5900000, contribution:690000, note:"", snaps:[
        {id:"s1", date:"2026-03-31", total:5480000, added:340000, note:"Q1 SIPs and PF"},
        {id:"s2", date:"2026-09-12", total:5900000, added:350000, note:""}]}
    ]
  };
}

/* Withdraw order is an ordinal: 1 is sold first. Distinct values are
   compressed to 1..n once ON LOAD (merge) — order and ties both survive.
   Never called from normalize(), which would rewrite the number under the
   cursor while it is being typed. */
export function tidyOrder(s){
  const vals = Array.from(new Set(s.investments.map(i => num(i.pri, 50)))).sort((a,b) => a-b);
  const map = {}; vals.forEach((v,k) => map[v] = k + 1);
  s.investments.forEach(i => i.pri = map[num(i.pri, 50)]);
}

/* Holdings are kept in withdraw-priority order, ties broken by id. The engine is order-sensitive inside an equal-priority band
   (the shared exemption is consumed in order), so this makes the result
   independent of the order rows were typed in. */
export function byWithdrawOrder(a, b){
  const d = num(a.pri, 50) - num(b.pri, 50);
  if (d) return d;
  const x = String(a.id), y = String(b.id);
  return x < y ? -1 : x > y ? 1 : 0;
}
export function sortHoldings(s){ s.investments.sort(byWithdrawOrder); return s; }

export function normalize(s){
  s.a.asOf = normDate(s.a.asOf, s.a.currentYear);
  s.a.currentYear = asOfYear(s);                      // the as-of date is the anchor
  if (s.a.rolledThrough == null) s.a.rolledThrough = s.a.currentYear - 1;
  if (s.a.cgExempt == null) s.a.cgExempt = 125000;
  delete s.a.taxOn; delete s.a.strategy;              // v25 fields, no longer used
  s.investments.forEach(i => {
    const d = taxDefault(i.cat);
    if (i.taxRate == null) i.taxRate = d.rate;
    if (i.taxWhen == null){
      i.taxWhen = (i.taxKind === "annual") ? "tax_at_year_end"
                : (i.taxKind ? "tax_on_withdrawal" : d.when);
    }
    if (i.taxWhen !== "tax_at_year_end" && i.taxWhen !== "tax_on_withdrawal")
      i.taxWhen = "tax_on_withdrawal";
    if (i.cost == null) i.cost = num(i.val);          // assume no embedded gain unless told
    if (i.pri == null) i.pri = 50;
    delete i.taxKind;
  });
  s.a.retirementAge = Math.max(s.a.currentAge, Math.min(s.a.retirementAge, s.a.lifeExpectancy));
  s.a.lifeExpectancy = Math.max(s.a.lifeExpectancy, s.a.retirementAge);
  const ry = A.retYear(s), ey = A.endYear(s);
  s.goals.forEach(g => {
    if (g.isRet){ g.kind = "recurring"; g.start = ry; g.end = ey; }
    if (g.kind === "onetime") g.end = g.start;
  });

  /* The as-of year always has a row, and that row is the holdings total.
     Snapshots recorded during the year live under it. */
  s.history.forEach(h => {
    if (!Array.isArray(h.snaps)) h.snaps = [];
    h.snaps.forEach(sn => { sn.date = normDate(sn.date, h.year); if (sn.id == null) sn.id = uid("sn"); });
    h.snaps.sort((a,b) => String(a.date).localeCompare(String(b.date)));
  });
  const liveY = asOfYear(s);
  let live = s.history.find(h => num(h.year) === liveY);
  if (!live){
    live = {id:uid("h"), year:liveY, actual:0, contribution:0, note:"", snaps:[]};
    s.history.push(live);
  }
  live.actual = s.investments.filter(i => i.on).reduce((t,i) => t + num(i.val), 0);
  /* a year with snapshots gets its contribution from them, not by hand */
  s.history.forEach(h => {
    if (h.snaps.length) h.contribution = h.snaps.reduce((t,sn) => t + num(sn.added), 0);
  });
  s.a.liveYear = liveY;
  return s;
}

/* Load-time merge. Newer data in an older page is refused, never trimmed. */
export function merge(loaded){
  if (!loaded || typeof loaded !== "object") return {ok:false, error:"not a plan"};
  const d = defaultState();
  if (num(loaded.schemaVersion) > SCHEMA){
    return {ok:false, error:"newer", dataVersion: Math.round(num(loaded.schemaVersion)), pageVersion: SCHEMA};
  }
  const state = {
    v: 2, schemaVersion: SCHEMA,
    savedAt: loaded.savedAt || null,
    a: Object.assign({}, d.a, loaded.a || {}),
    investments: Array.isArray(loaded.investments) ? loaded.investments : d.investments,
    goals: Array.isArray(loaded.goals) ? loaded.goals : d.goals,
    history: Array.isArray(loaded.history) ? loaded.history : d.history
  };
  if (loaded.a && !loaded.a.asOf && loaded.a.currentYear){
    state.a.asOf = Math.round(num(loaded.a.currentYear)) + "-01";
    state.a.rolledThrough = Math.round(num(loaded.a.currentYear)) - 1;
  }
  state.history.forEach(h => { if (!h.id) h.id = uid("h"); });
  tidyOrder(state);
  state.investments.forEach(i => { if (!i.id) i.id = uid("i"); });
  state.goals.forEach(g => { if (!g.id) g.id = uid("g"); });
  sortHoldings(state);
  normalize(state);
  return {ok:true, state};
}

/* Year rollover. A finished calendar year becomes a history row; the amount
   invested in it is left at zero deliberately. `today` is injected. */
export function rollForward(state, today){
  const now = today || new Date();
  const sysY = now.getFullYear();
  const from = asOfYear(state);
  if (from >= sysY || num(state.a.rolledThrough) >= sysY - 1){
    if (num(state.a.rolledThrough) < sysY - 1) state.a.rolledThrough = sysY - 1;
    return null;
  }
  const undo = clone(state);
  const total = state.investments.filter(i => i.on).reduce((t,i) => t + num(i.val), 0);
  const closed = [];
  for (let y = from; y < sysY; y++){
    if (!state.history.some(h => num(h.year) === y)){
      state.history.push({id:uid("h"), year:y, actual:total, contribution:0, snaps:[],
        note:"Carried forward automatically — replace with the real year-end figure"});
    }
    closed.push(y);
  }
  state.a.rolledThrough = sysY - 1;
  state.a.asOf = systemDate(now);
  normalize(state);
  return {years: closed, to: sysY, undo};
}

/* Opening a file also LINKS it, so "is this actually a plan?" has teeth:
   pointing at an unrelated .json and then saving would overwrite it. */
export function looksLikePlan(o){
  return !!o && typeof o === "object" && !Array.isArray(o)
      && (Array.isArray(o.investments) || Array.isArray(o.goals));
}
