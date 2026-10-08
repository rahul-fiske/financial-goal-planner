/* Lifted from the v37 planner page (_archive/v37_reference) on 2026-09-19; edited since. */
function recordSnapshot(){
  normalize(state);
  const liveY = asOfYear(state);
  const row = state.history.find(h => num(h.year) === liveY);
  if (!row) return;
  const on = state.investments.filter(i => i.on);
  const total = on.reduce((t,i) => t + num(i.val), 0);
  const byInv = {}; on.forEach(i => byInv[i.id] = num(i.val));
  const date = normDate(state.a.asOf);
  const dup = (row.snaps || []).find(sn => sn.date === date);
  if (dup){ dup.total = total; dup.byInv = byInv; }
  else row.snaps.push({id:uid("sn"), date, total, added:0, note:"", byInv});
  normalize(state);
  activeTab = "hist";
  render(); markDirty();
  flash((dup ? "updated " : "recorded ") + dateShort(date));
}

function applySnap(tr, el){
  const h = state.history.find(x => x.id === tr.dataset.hid); if (!h) return;
  const sn = (h.snaps || []).find(x => x.id === tr.dataset.sid); if (!sn) return;
  const k = el.dataset.sn;
  if (k === "note") sn.note = el.value;
  else if (k === "added") sn.added = mnum(el.value);
  else if (k === "date"){
    const d = normDate(el.value, h.year);
    sn.date = d;
    /* a reading moved into another year belongs to that year's row */
    if (dateYear(d) !== num(h.year)){
      h.snaps = h.snaps.filter(x => x.id !== sn.id);
      let target = state.history.find(x => num(x.year) === dateYear(d));
      if (!target){
        target = {id:uid("h"), year:dateYear(d), actual:sn.total, contribution:0, snaps:[], note:""};
        state.history.push(target);
      }
      target.snaps.push(sn);
    }
  }
  normalize(state);
}
