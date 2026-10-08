/* Ported from the v37 planner page (_archive/v37_reference); the one change is Phase 4b's handling
   of estimated rows, which is a no-op for any history without them. */
import { num, asOfYear } from "../schema/util.mjs";

/* History / on-track: planned vs actual across closed years. */
export function track(s){
  const liveY = asOfYear(s);
  const all = s.history.slice().sort((x,y) => num(x.year) - num(y.year));
  /* The year still running holds a part-year figure. Measuring it against a
     whole year of predicted growth would read as "behind" when nothing is
     wrong, so it sits out of the comparison until it closes. */
  const withEst = all.filter(r => num(r.year) < liveY);
  /* Phase 4b: an estimated year is never evidence. It is left out of the
     comparison entirely; with fewer than two RECORDED years the result is a
     sketch — planned values for the chart's slope, no gap, no headline. */
  const closed = withEst.filter(r => !r.estimated);
  const bare = extra => Object.assign({
    rows: all.map(r => Object.assign({}, r, {planned:null, gap:null, inProgress:num(r.year) === liveY})),
    enough:false
  }, extra || {});

  const inv = s.investments.filter(i => i.on);
  const tot = inv.reduce((t,i) => t + num(i.val), 0);
  const assumed = tot ? inv.reduce((t,i) => t + num(i.val)*num(i.ret), 0)/tot : 0.08;

  if (closed.length < 2){
    if (withEst.length < 2) return bare();
    const p = [num(withEst[0].actual)];
    for (let k = 1; k < withEst.length; k++){
      const prev = p[k-1], c = num(withEst[k].contribution);
      p.push(prev + c + (prev + c/2) * assumed);
    }
    const at = {}; withEst.forEach((r,k) => at[r.id] = p[k]);
    return {
      rows: all.map(r => Object.assign({}, r, {planned: at[r.id] != null ? at[r.id] : null, gap:null,
                                               inProgress: num(r.year) === liveY})),
      enough:false, sketch:true, assumed
    };
  }
  const run = rate => {
    const out = [num(closed[0].actual)];
    for (let k = 1; k < closed.length; k++){
      const prev = out[k-1], c = num(closed[k].contribution);
      out.push(prev + c + (prev + c/2) * rate);
    }
    return out;
  };
  const planned = run(assumed);
  let lo = -0.5, hi = 0.6;
  for (let k = 0; k < 160; k++){
    const mid = (lo+hi)/2;
    if (run(mid)[closed.length-1] < num(closed[closed.length-1].actual)) lo = mid; else hi = mid;
  }
  const implied = (lo+hi)/2;
  const last = num(closed[closed.length-1].actual), lastP = planned[planned.length-1];
  const at = {}; closed.forEach((r,k) => at[r.id] = planned[k]);
  return {
    rows: all.map(r => {
      const p = at[r.id];
      return Object.assign({}, r, p == null
        ? {planned:null, gap:null, inProgress:num(r.year) === liveY}
        : {planned:p, gap:num(r.actual) - p, inProgress:false});
    }),
    enough:true, assumed, implied, gap:last-lastP,
    gapPct: lastP ? (last-lastP)/lastP : 0,
    span: num(closed[closed.length-1].year) - num(closed[0].year)
  };
}
