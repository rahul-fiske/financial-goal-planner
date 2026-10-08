/* Lifted from the v37 planner page (_archive/v37_reference) on 2026-09-19; edited since. */
const IN = new Intl.NumberFormat("en-IN", {maximumFractionDigits:0});
function inr(n){ const s = IN.format(Math.round(Math.abs(n))); return (n<0?"−₹":"₹")+s; }
function short(n){
  const a = Math.abs(n), sg = n<0?"−":"";
  if (a >= 1e7) return sg+"₹"+(a/1e7).toFixed(a/1e7>=100?0:2)+" cr";
  if (a >= 1e5) return sg+"₹"+(a/1e5).toFixed(a/1e5>=100?0:1)+" L";
  if (a >= 1000) return sg+"₹"+IN.format(Math.round(a));
  return sg+"₹"+Math.round(a);
}
function pct(x, d){ return (x*100).toFixed(d===undefined?1:d)+"%"; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const MON3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function dateLong(v){
  const p = String(v).split("-");
  return Number(p[2]) + " " + MONTHS[Number(p[1])-1] + " " + p[0];
}
function dateShort(v){
  const p = String(v).split("-");
  return Number(p[2]) + " " + MON3[Number(p[1])-1] + " " + p[0];
}
function asOfLabel(s){ return dateLong(normDate(s.a.asOf)); }
