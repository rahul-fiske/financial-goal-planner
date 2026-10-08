/* Ported from the v37 planner page (_archive/v37_reference). The ONLY place maths lives.
   One deliberate change (v1.3.0): holdings still LOCKED in a year
   keep their projected balance instead of being scaled with the rest — see
   below. With no lock-ins the curve is identical to v37's. */
import { num, clone } from "../schema/util.mjs";
import { project } from "./project.mjs";

/* The corpus needed at the start of each year for every remaining goal to be
   met in full, ASSUMING planned contributions continue. Goal amt and holding
   add are re-quoted to year t before each trial. */
export function requiredCurve(s, proj){
  const years = proj.years, out = new Array(years.length).fill(null);
  const live = s.investments.filter(i => i.on);
  if (!live.length) return out;

  const dueFrom = new Array(years.length + 1).fill(0);
  for (let i = years.length - 1; i >= 0; i--)
    dueFrom[i] = dueFrom[i+1] + years[i].goals.reduce((t,g) => t + g.due, 0);

  const base = s.a.currentYear;
  const p = clone(s);
  p.investments = p.investments.filter(i => i.on);
  const addBase = p.investments.map(i => num(i.add));
  const goalBase = p.goals.map(g => ({amt: num(g.amt), infl: num(g.infl)}));

  for (let i = 0; i < years.length; i++){
    const y = years[i];
    if (dueFrom[i] <= 0){ out[i] = 0; continue; }

    p.a.currentYear = y.year;
    p.a.currentAge  = y.age;
    /* amounts are quoted in base-year money and escalate from currentYear,
       so both goals and contributions are re-quoted to this year */
    p.goals.forEach((g,k) => g.amt = goalBase[k].amt * Math.pow(1 + goalBase[k].infl, y.year - base));
    p.investments.forEach((inv,k) => inv.add = addBase[k] * Math.pow(1 + num(inv.step), y.year - base));

    /* A holding locked this year (NPS until 2048, say) cannot pay for anything
       until it opens, so scaling it up with the rest asks the wrong question —
       once the open holdings run dry the corpus would be "all NPS" and no
       amount of it could fund the next year, leaving gaps and spikes in the
       curve. Locked holdings are therefore held at their projected balance;
       the search is over what the OPEN holdings need, in their own mix, and
       the requirement is that plus the locked balances. */
    const locked = live.map(inv => inv.avail != null && y.year < num(inv.avail));
    const anyOpen = locked.some(l => !l);
    let tot = 0, fixed = 0; const w = [], bf = [], hold = [];
    live.forEach((inv,k) => {
      const b = y.byInv[inv.id] || {opening:0, basisOpen:0};
      const o = Math.max(b.opening, 0);
      bf[k] = o > 0 ? Math.min(Math.max(b.basisOpen,0) / o, 1) : 1;
      if (anyOpen && locked[k]){ hold[k] = o; fixed += o; w[k] = 0; }
      else { hold[k] = null; w[k] = o; tot += o; }
    });
    const nFree = live.filter((inv,k) => hold[k] == null).length;
    live.forEach((inv,k) => { if (hold[k] == null) w[k] = tot > 0 ? w[k]/tot : 1/nFree; });

    const trial = C => {
      for (let k = 0; k < p.investments.length; k++){
        const v = hold[k] != null ? hold[k] : C * w[k];
        p.investments[k].val = v;
        p.investments[k].cost = v * bf[k];
      }
      return project(p).m.totalShortfall < 1;
    };

    let hi = (out[i+1] != null ? out[i+1] - fixed : 0) + dueFrom[i] + 1, guard = 0;
    if (hi < 1) hi = dueFrom[i] + 1;
    while (guard++ < 12 && !trial(hi)) hi *= 2;
    if (!trial(hi)){ out[i] = null; continue; }
    let lo = 0;
    for (let k = 0; k < 13; k++){ const mid = (lo+hi)/2; if (trial(mid)) hi = mid; else lo = mid; }
    out[i] = hi + fixed;
  }
  return out;
}

/* requiredCurve is a START-of-year figure; everything else is end-of-year.
   Shift one year left so the band lines up with the chart. */
export function reqEndFor(years, curve){
  const r = (curve && curve.length === years.length) ? curve : null;
  return r ? years.map((y,i) => (i + 1 < r.length ? r[i+1] : 0)) : null;
}
