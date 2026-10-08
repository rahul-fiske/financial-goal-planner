/* Hand-calculated engine tests. Run: node --test tests/engine/
   Each expected figure is worked out by hand in the comment beside it. */
import test from "node:test";
import assert from "node:assert/strict";
import { project, requiredCurve, reqEndFor } from "../../src/engine/index.mjs";
import { merge, normalize, tidyOrder, defaultState } from "../../src/schema/plan.mjs";
import { serialiseJson, parsePlanText, backupName } from "../../src/schema/file.mjs";

const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b}`);

/* one-holding, no-goal plan; override anything */
function plan(over = {}){
  const s = {
    v: 2, schemaVersion: 1,
    a: {currentYear: 2026, currentAge: 40, retirementAge: 60, lifeExpectancy: 42,
        postRetReturn: 0.05, usePostRet: false, asOf: "2026-01-01", rolledThrough: 2025, cgExempt: 0},
    investments: [], goals: [], history: []
  };
  Object.assign(s.a, over.a || {});
  s.investments = over.investments || [];
  s.goals = over.goals || [];
  return normalize(s);
}
const H = (o) => Object.assign({id:"h", name:"H", cat:"Other", val:0, cost:null, add:0, step:0, ret:0,
  until:null, avail:null, pri:1, on:true, taxWhen:"tax_on_withdrawal", taxRate:0}, o);
const G = (o) => Object.assign({id:"g", name:"G", kind:"onetime", start:2026, end:2026, amt:0, infl:0,
  ess:true, on:true, isRet:false}, o);

test("mid-year growth: (opening + contribution/2) * rate", () => {
  // 100000 opening, 12000 added, 10%: growth = (100000 + 6000) * 0.10 = 10600
  const p = project(plan({investments:[H({val:100000, add:12000, ret:0.10})]}));
  near(p.years[0].growth, 10600);
  near(p.years[0].closing, 122600);
});

test("step-up escalates the addition from the base year", () => {
  // year 2 add = 10000 * 1.05 = 10500
  const p = project(plan({investments:[H({val:0, add:10000, step:0.05, ret:0})]}));
  near(p.years[1].contribution, 10500);
});

test("year-end tax: charged on growth, added to basis, never on withdrawal", () => {
  // 100000 at 10%, 30% year-end: growth 10000, tax 3000, closing 107000, basis 107000
  const p = project(plan({investments:[H({val:100000, ret:0.10, taxWhen:"tax_at_year_end", taxRate:0.30})]}));
  near(p.years[0].tax, 3000);
  near(p.years[0].closing, 107000);
  near(p.years[0].embeddedTax, 0);   // year-end holdings carry no deferred liability
});

test("cost basis defaults to current value", () => {
  const s = plan({investments:[H({val:500, cost:null})]});
  assert.equal(s.investments[0].cost, 500);
});

test("equal-rupee ties with water-filling spillover", () => {
  // Need 100. A has 20, B has 1000, same band: 50/50 would take 50 from A;
  // A gives its 20, B covers 80.
  const p = project(plan({
    investments:[H({id:"A", val:20}), H({id:"B", val:1000})],
    goals:[G({amt:100})]}));
  near(p.years[0].byInv.A.withdrawal, 20);
  near(p.years[0].byInv.B.withdrawal, 80);
});

test("ordinal withdraw order: band 1 empties before band 2 is touched", () => {
  const p = project(plan({
    investments:[H({id:"A", val:50, pri:1}), H({id:"B", val:1000, pri:2})],
    goals:[G({amt:120})]}));
  near(p.years[0].byInv.A.withdrawal, 50);
  near(p.years[0].byInv.B.withdrawal, 70);
});

test("withdrawals capped at available money; gap reported as shortfall", () => {
  const p = project(plan({investments:[H({val:300})], goals:[G({amt:1000})]}));
  near(p.years[0].byInv.h.withdrawal, 300);
  near(p.years[0].shortfall, 700);
  assert.equal(p.m.depletionYear, 2026);
});

test("gross-up: after-tax proceeds meet the goal exactly", () => {
  // val 1000, cost 500 → gain fraction 0.5; rate 20%, no exemption.
  // net = g(1 - 0.5*0.2) = 0.9g, so g = 900/0.9 = 1000 for a 900 goal.
  const p = project(plan({investments:[H({val:2000, cost:1000, taxRate:0.20})], goals:[G({amt:900})]}));
  near(p.years[0].byInv.h.withdrawal, 1000, 1e-3);
  near(p.years[0].tax, 100, 1e-3);
  near(p.years[0].shortfall, 0);
});

test("gross-up skipped when nothing in play is taxed on exit", () => {
  const p = project(plan({investments:[H({val:2000, cost:1000, taxRate:0})], goals:[G({amt:900})]}));
  assert.equal(p.years[0].byInv.h.withdrawal, 900);      // exact: no bisection ran
});

test("shared exemption applies to withdrawal gains only, not year-end ones", () => {
  // Deposit: 10000 growth at 30% year-end → 3000 tax regardless of exemption.
  // Equity: draw with gain fraction 0.5, exemption 125000 covers all its gain.
  const p = project(plan({
    a:{cgExempt:125000},
    investments:[
      H({id:"D", val:100000, ret:0.10, taxWhen:"tax_at_year_end", taxRate:0.30, pri:2}),
      H({id:"E", val:200000, cost:100000, taxRate:0.125, pri:1})],
    goals:[G({amt:100000})]}));
  near(p.years[0].byInv.D.taxYear, 3000);
  near(p.years[0].byInv.E.taxDraw, 0);   // 50000 of gain, fully exempt
});

test("tidyOrder compresses in merge, never in normalize", () => {
  const raw = {a:{asOf:"2026-01-01", currentYear:2026, currentAge:40, retirementAge:60, lifeExpectancy:80},
    investments:[H({id:"x", pri:10}), H({id:"y", pri:10}), H({id:"z", pri:40})], goals:[], history:[]};
  const n = normalize(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(n.investments.map(i => i.pri), [10, 10, 40]);
  const m = merge(JSON.parse(JSON.stringify(raw))).state;
  assert.deepEqual(m.investments.map(i => i.pri), [1, 1, 2]);
});

test("reqEndFor shifts the start-of-year curve one year left, 0 at the end", () => {
  const years = [{}, {}, {}];
  assert.deepEqual(reqEndFor(years, [30, 20, 10]), [20, 10, 0]);
  assert.equal(reqEndFor(years, [1, 2]), null);   // stale length → nothing
});

test("requiredCurve: a single 1000 goal next year at 0% needs 1000 at the start", () => {
  const s = plan({investments:[H({val:5000})], goals:[G({start:2027, end:2027, amt:1000})]});
  const c = requiredCurve(s, project(s));
  near(c[0], 1000, 1);   // bisection tolerance
});

test("newer schema is refused, not trimmed", () => {
  const r = merge({schemaVersion: 99, a:{}, investments:[], goals:[]});
  assert.equal(r.ok, false);
  assert.equal(r.error, "newer");
});

test("goal_plan.json: schemaVersion first, integer rupees, legacy .js still reads", () => {
  const s = merge(defaultState()).state;
  s.investments[0].val = 1800000.4;
  const txt = serialiseJson(s);
  assert.match(txt, /^\{\n  "schemaVersion": 1,/);
  assert.equal(JSON.parse(txt).investments[0].val, 1800000);
  const js = "/* c = { */\nwindow.PLAN =\n" + txt.trim() + ";\n";
  assert.equal(parsePlanText(js).a.currentAge, 38);
  const js2 = "window.GOAL_PLAN = " + txt.trim() + ";";
  assert.equal(parsePlanText(js2).a.currentAge, 38);
});

test("backup names sort and never localise", () => {
  assert.equal(backupName(new Date(2026, 8, 19, 14, 30, 2)), "goal_plan_20260919-143002.json");
});

test("holding order: engine result does not depend on array order; file and load sort by priority", () => {
  const s = merge(defaultState()).state;
  assert.deepEqual(s.investments.map(i => i.pri), [1, 2, 3, 4, 5]);
  const a = project(JSON.parse(JSON.stringify(s)));
  const r = JSON.parse(JSON.stringify(s)); r.investments.reverse();
  const b = project(r);
  assert.equal(JSON.stringify(a.years), JSON.stringify(b.years));
  const f = JSON.parse(serialiseJson(r));
  assert.deepEqual(f.investments.map(i => i.id), s.investments.map(i => i.id));
});

/* ---------------------------------------------------- Phase 4b estimate */
import { ensureEstimate } from "../../src/schema/history.mjs";
import { track } from "../../src/engine/track.mjs";

function oneYearPlan(){
  // one holding at 10%, one recorded closed year (2025), live year 2026
  const s = plan({a:{lifeExpectancy: 80}, investments:[H({val:1100000, add:120000, ret:0.10})]});
  s.history = [{id:"h25", year:2025, actual:1000000, contribution:100000, note:"", snaps:[]}];
  return normalize(s);
}

test("estimate: exact inverse of the mid-year convention, one year back", () => {
  const s = oneYearPlan();
  assert.equal(ensureEstimate(s), true);
  const e = s.history.find(h => h.estimated);
  assert.equal(e.year, 2024);
  // prev = (1,000,000 − 100,000 × 1.05) / 1.10 = 813,636.36 → 813,636
  assert.equal(e.actual, 813636);
  // plan add 120,000 at 0% step → 120,000
  assert.equal(e.contribution, 120000);
  assert.match(e.note, /^Estimated, not a recorded value: worked back from 2025 at the plan's 10\.00%/);
  assert.equal(ensureEstimate(s), false, "idempotent");
});

test("estimate: kept out of the comparison — sketch only, no gap, no headline", () => {
  const s = oneYearPlan(); ensureEstimate(s);
  const t = track(s);
  assert.equal(t.enough, false);
  assert.equal(t.sketch, true);
  assert.ok(t.rows.every(r => r.gap == null));
  const r25 = t.rows.find(r => r.year === 2025);
  near(r25.planned, 1000000, 1, "sits on the plan by construction");
});

test("estimate: never over a real figure, stays gone when removed, not needed with two records", () => {
  const a = oneYearPlan();
  a.history.push({id:"h24", year:2024, actual:900000, contribution:0, note:"", snaps:[]});
  assert.equal(ensureEstimate(a), false);
  assert.equal(a.history.find(h => h.year === 2024).actual, 900000);

  const b = oneYearPlan(); b.a.noEstimate = true;
  assert.equal(ensureEstimate(b), false);

  const c = merge(defaultState()).state;          // four recorded years
  assert.equal(ensureEstimate(c), false);
});

test("estimate: with two recorded years it is ignored, results identical to having none", () => {
  const s = oneYearPlan();
  s.history.push({id:"h23", year:2023, actual:800000, contribution:90000, note:"", snaps:[]});
  const without = track(JSON.parse(JSON.stringify(s)));
  s.history.push({id:"hx", year:2022, actual:1, contribution:0, estimated:true, note:"", snaps:[]});
  const withEst = track(s);
  assert.equal(withEst.enough, true);
  assert.equal(withEst.implied, without.implied);
  assert.equal(withEst.gap, without.gap);
  assert.equal(withEst.rows.find(r => r.year === 2022).gap, null);
});

test("required curve: a holding still locked is held at its balance, so the curve has no gaps", () => {
  // Open holding runs dry long before the locked one opens; v37 returned null there.
  const s = plan({a:{lifeExpectancy: 55, postRetReturn: 0.05, usePostRet: true, retirementAge: 41},
    investments:[H({id:"O", val:300000, pri:1, ret:0.05}), H({id:"K", val:2000000, avail:2045, pri:2, ret:0.05})],
    goals:[G({kind:"recurring", start:2027, end:2041, amt:200000, isRet:true})]});
  const p = project(s);
  const c = requiredCurve(s, p);
  assert.ok(c.every(v => v != null), "no gaps");
  const i = p.years.findIndex(y => y.year === 2033);
  assert.ok(c[i] >= p.years[i].byInv.K.opening, "at least the locked balance");
});
