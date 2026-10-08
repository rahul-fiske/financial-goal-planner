/* Ported verbatim from the v37 planner page (_archive/v37_reference). The ONLY place maths lives.
   Do not edit without re-running tests/parity_html.mjs. */
import { num, clone } from "../schema/util.mjs";
import { normalize } from "../schema/plan.mjs";
import { project } from "./project.mjs";

export function survives(s){ return project(s).m.totalShortfall < 1; }

/* Add (or remove) a lump sum today, spread across holdings in proportion to
   their size. Money going in is new principal; money coming out takes
   principal and gain in the same proportion as the holding, the same rule the
   engine uses for every other withdrawal. */
export function withLump(s, delta){
  const p = clone(s);
  const on = p.investments.filter(i => i.on);
  const tot = on.reduce((t,i) => t + num(i.val), 0);
  if (tot <= 0) return p;
  on.forEach(i => {
    const v = num(i.val), c = num(i.cost, v), d = delta * (v / tot);
    if (d >= 0){ i.val = v + d; i.cost = c + d; }
    else {
      const take = Math.min(-d, v);
      const principalShare = v > 0 ? Math.min(c / v, 1) : 1;
      i.val = v - take;
      i.cost = Math.max(0, c - take * principalShare);
    }
  });
  return p;
}

export function solveAll(s){
  const out = {retireAge:null, contribMult:null, sustainable:null, lumpToday:null};

  /* the earliest retirement age that still funds everything — below the
     current age this reads as slack, above it as the price of the gap */
  for (let age = s.a.currentAge; age <= Math.min(s.a.lifeExpectancy, 80); age++){
    const p = normalize(clone(s)); p.a.retirementAge = age; normalize(p);
    if (survives(p)){ out.retireAge = age; break; }
  }

  const okMult = m => { const p = clone(s); p.investments.forEach(i => i.add = num(i.add)*m); return survives(p); };
  if (okMult(1)){
    /* already funded: find the SMALLEST multiple that still works, so the
       difference from 1 is the slack in what is being put away */
    if (okMult(0)) out.contribMult = 0;
    else {
      let lo = 0, hi = 1;
      for (let k = 0; k < 44; k++){ const mid = (lo+hi)/2; if (okMult(mid)) hi = mid; else lo = mid; }
      out.contribMult = hi;
    }
  } else if (okMult(20)){
    let lo = 1, hi = 20;
    for (let k = 0; k < 44; k++){ const mid = (lo+hi)/2; if (okMult(mid)) hi = mid; else lo = mid; }
    out.contribMult = hi;
  }

  const retGoal = s.goals.find(g => g.isRet && g.on);
  if (retGoal){
    const okAmt = v => { const p = clone(s); p.goals.forEach(g => { if (g.isRet) g.amt = v; }); return survives(p); };
    let lo = 0, hi = Math.max(num(retGoal.amt)*4, 1);
    if (okAmt(hi)) out.sustainable = hi;
    else { for (let k = 0; k < 44; k++){ const mid = (lo+hi)/2; if (okAmt(mid)) lo = mid; else hi = mid; } out.sustainable = lo; }
  }

  /* signed: positive is corpus you could take out today, negative is what
     would have to go in for the plan to hold */
  const corpus = s.investments.filter(i => i.on).reduce((t,i) => t + num(i.val), 0);
  const okLump = d => survives(withLump(s, d));
  if (okLump(0)){
    if (okLump(-corpus)) out.lumpToday = corpus;
    else {
      let lo = 0, hi = corpus;
      for (let k = 0; k < 40; k++){ const mid = (lo+hi)/2; if (okLump(-mid)) lo = mid; else hi = mid; }
      out.lumpToday = lo;
    }
  } else {
    const ceiling = corpus * 20 + 1e7;
    if (okLump(ceiling)){
      let lo = 0, hi = ceiling;
      for (let k = 0; k < 40; k++){ const mid = (lo+hi)/2; if (okLump(mid)) hi = mid; else lo = mid; }
      out.lumpToday = -hi;
    }
  }
  return out;
}
