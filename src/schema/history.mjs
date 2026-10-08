/* Phase 4b — one estimated prior history year.

   The on-track comparison needs two closed years. With only one recorded,
   a single prior year is worked back from it by reversing the engine's own
   mid-year convention exactly (track() runs  close = prev + c + (prev + c/2)·r):

       prev = (close − c·(1 + r/2)) / (1 + r)

   r is the same value-weighted return track() assumes; c is what went in
   during the recorded year (its own figure when there is one, otherwise the
   plan's annual investing de-escalated by each holding's step-up).

   THE TRAP: a year derived from the plan's own return sits on the planned
   curve by construction, so its "gap" is zero by definition. It is therefore
   stored as `estimated: true`, drawn hollow and dashed, and kept OUT of the
   gap statistic and the on-track headline (see track()). It exists only to
   give the chart a second point and a slope.

   One year back only. Never derived over a real figure: typing a value into
   the row clears the flag (ui/events.js), and a row that is not estimated is
   never touched here. Deleting the row sets a.noEstimate so it stays gone.  */
import { num, uid, asOfYear } from "./util.mjs";

export function estimateNote(fromYear, r){
  return `Estimated, not a recorded value: worked back from ${fromYear} at the plan's `
    + `${(r * 100).toFixed(2)}% assumed return.`;
}

/* Returns true when it added or re-derived a row. Pure apart from mutating s. */
export function ensureEstimate(s){
  if (!s || !Array.isArray(s.history) || (s.a && s.a.noEstimate)) return false;
  const liveY = asOfYear(s);
  const recorded = s.history.filter(h => num(h.year) < liveY && !h.estimated)
                            .sort((a, b) => num(a.year) - num(b.year));
  if (recorded.length !== 1) return false;
  const base = recorded[0], y = num(base.year) - 1;
  let row = s.history.find(h => num(h.year) === y);
  if (row && !row.estimated) return false;                 // never over a real one

  const on = s.investments.filter(i => i.on);
  const tot = on.reduce((t, i) => t + num(i.val), 0);
  const r = tot ? on.reduce((t, i) => t + num(i.val) * num(i.ret), 0) / tot : 0.08;
  const planAdd = yr => on.reduce((t, i) => t + num(i.add) / Math.pow(1 + num(i.step), s.a.currentYear - yr), 0);
  const c = num(base.contribution) > 0 ? num(base.contribution) : planAdd(num(base.year));
  const prev = (num(base.actual) - c * (1 + r / 2)) / (1 + r);
  if (!(prev > 0)) return false;                           // nothing sensible to show

  const want = {actual: Math.round(prev), contribution: Math.round(planAdd(y)), note: estimateNote(y + 1, r)};
  if (!row){
    row = {id: uid("h"), year: y, estimated: true, snaps: []};
    s.history.push(row);
  } else if (row.actual === want.actual && row.contribution === want.contribution && row.note === want.note){
    return false;
  }
  Object.assign(row, want);
  return true;
}
