/* Drawn-from / tax attribution and the year-by-year export rows.
   Ported from yearsTab() and exportCsv() in the v37 planner page (_archive/v37_reference); the
   markup stays in ui/, the numbers and their order live here. */
import { num } from "../schema/util.mjs";

/* Holdings are labelled by bare name, with the owner appended only when two
   enabled holdings share a name. */
export function holdLabeller(state){
  const seen = {};
  state.investments.filter(i => i.on).forEach(i => seen[i.name] = (seen[i.name] || 0) + 1);
  return i => (seen[i.name] > 1 && i.owner) ? i.name + " (" + i.owner + ")" : i.name;
}

/* Every holding that either gave money or paid tax this year. A holding taxed
   as it accrues pays on its growth even in a year nothing is taken from it. */
export function drawnFrom(state, y, holdLabel){
  const label = holdLabel || holdLabeller(state);
  return state.investments
    .filter(i => {
      const b = i.on && y.byInv[i.id]; if (!b) return false;
      return b.withdrawal > 1 || (num(b.taxYear) + num(b.taxDraw)) > 1;
    })
    .map(i => {
      const b = y.byInv[i.id];
      return {id: i.id, name: label(i), amt: num(b.withdrawal), tax: num(b.taxYear) + num(b.taxDraw)};
    })
    .sort((a,b) => (b.amt - a.amt) || (b.tax - a.tax));
}

export const CSV_HEADER = ["Year","Age","Phase","Opening","Invested","Growth","Goal spending",
  "Living costs","Tax","Total out","Unfunded","Closing","Needed by year end","Surplus or short",
  "Drawn from","Tax by holding","Events"];

/* rq is the END-of-year required curve (reqEndFor), or null. */
export function yearRows(state, years, rq){
  const rows = [CSV_HEADER.slice()];
  years.forEach((y, yi) => rows.push([
    y.year, y.age, y.phase, Math.round(y.opening), Math.round(y.contribution), Math.round(y.growth),
    Math.round(y.goalSpend), Math.round(y.retSpend), Math.round(y.tax), Math.round(y.outflow), Math.round(y.shortfall),
    Math.round(y.closing),
    rq && rq[yi] != null ? Math.round(rq[yi]) : "",
    rq && rq[yi] != null ? Math.round(y.closing - rq[yi]) : "",
    state.investments.filter(i => i.on && y.byInv[i.id] && y.byInv[i.id].withdrawal > 1)
      .sort((a,b) => y.byInv[b.id].withdrawal - y.byInv[a.id].withdrawal)
      .map(i => i.name + (i.owner ? " (" + i.owner + ")" : "") + ": " + Math.round(y.byInv[i.id].withdrawal))
      .join("; "),
    state.investments.filter(i => i.on && y.byInv[i.id] && (num(y.byInv[i.id].taxYear) + num(y.byInv[i.id].taxDraw)) > 1)
      .map(i => i.name + (i.owner ? " (" + i.owner + ")" : "") + ": "
              + Math.round(num(y.byInv[i.id].taxYear) + num(y.byInv[i.id].taxDraw)))
      .join("; "),
    y.goals.map(g => g.name + (g.short > 1 ? " (short " + Math.round(g.short) + ")" : "")).join("; ")
  ]));
  return rows;
}

export function toCsv(rows){
  return rows.map(r => r.map(c => {
    const s = String(c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  }).join(",")).join("\n");
}
