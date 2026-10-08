/* Small pure helpers shared by schema and engine. Ported verbatim from
   the v37 planner page (_archive/v37_reference) — behaviour must not drift (see tests/parity_html.mjs). */

export function uid(p){ return p + Math.random().toString(36).slice(2,8); }
export function clone(o){ return JSON.parse(JSON.stringify(o)); }
export function num(v, fb){ const n = parseFloat(v); return isFinite(n) ? n : (fb||0); }
/* rupee fields are typed with grouping separators; read the digits back out */
export function mnum(v){ const n = parseFloat(String(v).replace(/[^0-9.-]/g, "")); return isFinite(n) ? n : 0; }

/* The date the holding values were taken from, as YYYY-MM-DD. Plans written
   before this was a full date carry YYYY-MM, or a bare year. */
export function systemDate(now){
  const d = now || new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0")
                         + "-" + String(d.getDate()).padStart(2,"0");
}
export function normDate(v, fallbackYear){
  const t = String(v == null ? "" : v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}$/.test(t)) return t + "-01";
  if (/^\d{4}$/.test(t)) return t + "-01-01";
  return (fallbackYear || new Date().getFullYear()) + "-01-01";
}
export function dateYear(v){ return parseInt(String(v).slice(0,4), 10); }
export function asOfYear(s){ return dateYear(normDate(s.a.asOf)); }
