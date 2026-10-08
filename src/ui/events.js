/* Lifted from the v37 planner page (_archive/v37_reference) on 2026-09-19; edited since. */
/* ================================================================ events */
/* Listeners attach once, after the shell has rendered its root markup. */
function wireEvents(){
  document.getElementById("tabs").addEventListener("click", e => {
    const b = e.target.closest(".tab"); if (!b) return;
    activeTab = b.dataset.tab;
    document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t === b)));
    render();
  });

  /* Editing the as-of date is an explicit statement about which year the plan
     sits in, so it also acknowledges the current year — otherwise entering an
     old snapshot would immediately trip the rollover and undo the edit. */
  function applyAsOf(){
    const el = document.getElementById("asOfDate");
    if (!el || !/^\d{4}-\d{2}-\d{2}$/.test(el.value)) return;   // mid-typing, ignore
    state.a.asOf = el.value;
    state.a.rolledThrough = Math.max(num(state.a.rolledThrough), new Date().getFullYear() - 1);
    normalize(state);
  }

  document.getElementById("main").addEventListener("input", e => {
    const el = e.target;
    if (el.id === "cgExempt"){ state.a.cgExempt = mnum(el.value); softUpdate(); return; }
    if (el.dataset.as !== undefined){ applyAssumption(el); softUpdate(); return; }
    const tr = el.closest("tr");
    if (!tr) return;
    if (el.dataset.iv !== undefined){ applyInv(tr.dataset.id, el); softUpdate(); }
    else if (el.dataset.gl !== undefined){ applyGoal(tr.dataset.id, el); softUpdate(); }
    else if (el.dataset.hs !== undefined){ applyHist(tr, el); softUpdate(); }
    else if (el.dataset.sn !== undefined){ applySnap(tr, el); softUpdate(); }
  });

  document.getElementById("main").addEventListener("change", e => {
    const el = e.target;
    if (el.id === "asOfDate"){
      applyAsOf(); setTimeout(() => { render(); markDirty(); }, 0); return; }
    if (el.dataset.sn === "date"){
      const tr = el.closest("tr");
      if (tr){ applySnap(tr, el); setTimeout(() => { render(); markDirty(); }, 0); }
      return;
    }
    /* holdings are kept in withdraw-priority order; re-sort once the number is
       committed, never while it is being typed */
    if (el.dataset.iv === "pri"){ sortHoldings(state); render(); markDirty(); return; }
    if (el.type === "checkbox" || el.tagName === "SELECT"){
      if (el.dataset.as !== undefined){ applyAssumption(el); render(); return; }
      const tr = el.closest("tr"); if (!tr) return;
      if (el.dataset.iv !== undefined) applyInv(tr.dataset.id, el);
      else if (el.dataset.gl !== undefined) applyGoal(tr.dataset.id, el);
      render(); markDirty();
    }
  });

  document.getElementById("main").addEventListener("click", e => {
    if (e.target.id === "snapBtn"){ recordSnapshot(); return; }
    if (e.target.id === "asOfToday"){
      state.a.asOf = systemDate();
      state.a.rolledThrough = Math.max(num(state.a.rolledThrough), new Date().getFullYear() - 1);
      normalize(state); render(); markDirty(); return;
    }
    if (e.target.id === "rollOkBtn"){ rollNote = null; render(); return; }
    if (e.target.id === "rollUndoBtn"){
      if (rollUndo){ state = rollUndo; rollUndo = null; normalize(state); }
      rollNote = null; render(); markDirty(); flash("rollover undone"); return;
    }
    const kindBtn = e.target.closest("[data-kind]");
    if (kindBtn && !kindBtn.disabled){
      const g = state.goals.find(x => x.id === kindBtn.closest("tr").dataset.id);
      if (g){ g.kind = kindBtn.dataset.kind; if (g.kind === "onetime") g.end = g.start;
              else if (g.end <= g.start) g.end = Math.min(g.start + 10, A.endYear(state)); }
      render(); markDirty(); return;
    }
    const del = e.target.closest("[data-del]");
    if (del){
      const tr = del.closest("tr");
      if (del.dataset.del === "inv")  state.investments = state.investments.filter(i => i.id !== tr.dataset.id);
      if (del.dataset.del === "goal") state.goals = state.goals.filter(g => g.id !== tr.dataset.id);
      if (del.dataset.del === "hist"){
        const gone = state.history.find(h => h.id === tr.dataset.id);
        if (gone && gone.estimated) state.a.noEstimate = true;     // removed on purpose: stay removed
        state.history = state.history.filter(h => h.id !== tr.dataset.id);
      }
      if (del.dataset.del === "snap"){
        const h = state.history.find(x => x.id === tr.dataset.hid);
        if (h) h.snaps = (h.snaps || []).filter(x => x.id !== tr.dataset.sid);
      }
      normalize(state);
      render(); markDirty(); return;
    }
    const add = e.target.closest("[data-add]");
    if (add){
      const cy = state.a.currentYear;
      if (add.dataset.add === "inv")
        state.investments.push({id:uid("i"), name:"New holding", cat:"Equity", owner:"",
          val:0, cost:0, add:0, step:0, ret:0.10, until:null, avail:null, on:true,
          pri: state.investments.reduce((m,i) => Math.max(m, num(i.pri,1)), 0) + 1,
          taxWhen:taxDefault("Equity").when, taxRate:taxDefault("Equity").rate});
      if (add.dataset.add === "goal")
        state.goals.push({id:uid("g"), name:"New goal", kind:"onetime", start:cy+3, end:cy+3, amt:1000000, infl:0.06, ess:false, on:true, isRet:false});
      if (add.dataset.add === "goalrec")
        state.goals.push({id:uid("g"), name:"New recurring goal", kind:"recurring", start:cy, end:cy+10, amt:300000, infl:0.06, ess:false, on:true, isRet:false});
      if (add.dataset.add === "hist"){
        const yrs = state.history.map(h => h.year);
        const y = yrs.length ? Math.min.apply(null, yrs) - 1 : cy - 1;
        state.history.push({id:uid("h"), year:y, actual:0, contribution:0, note:"", snaps:[]});
      }
      render(); markDirty(); return;
    }
    if (e.target.id === "csvBtn") exportCsv();
  });

  document.getElementById("main").addEventListener("focusin", e => {
    const el = e.target;
    if (el.classList && el.classList.contains("money")){
      /* strip the grouping separators for editing, then select the lot — assigning
         value moves the caret to the end, and without this a typed figure would
         land on the end of the old one instead of replacing it */
      const v = mnum(el.value); el.value = v ? String(v) : "";
      try { el.select(); } catch(e){ /* not selectable, no matter */ }
    }
  });
  document.getElementById("main").addEventListener("focusout", e => {
    const el = e.target;
    if (el.classList && el.classList.contains("money")) el.value = IN.format(mnum(el.value));
  });
}

function applyAssumption(el){
  const k = el.dataset.as;
  if (k === "usePostRet") state.a.usePostRet = el.checked;
  else if (k === "postRetReturn") state.a.postRetReturn = num(el.value)/100;
  else state.a[k] = Math.round(num(el.value));
  normalize(state);
}
function applyInv(id, el){
  const i = state.investments.find(x => x.id === id); if (!i) return;
  const k = el.dataset.iv;
  if (k === "on") i.on = el.checked;
  else if (k === "cat"){
    /* move the category and rate to the new type's defaults, but only while
       they still sit on the old type's — never overwrite a real edit */
    const was = taxDefault(i.cat);
    const untouched = Math.abs(num(i.taxRate) - was.rate) < 1e-9 && i.taxWhen === was.when;
    i.cat = el.value;
    if (untouched){ const now = taxDefault(i.cat); i.taxWhen = now.when; i.taxRate = now.rate; }
  }
  else if (k === "taxWhen") i.taxWhen = el.value;
  else if (k === "taxRate") i.taxRate = Math.max(0, num(el.value)/100);
  else if (k === "pri") i.pri = Math.max(1, Math.round(num(el.value)));
  else if (k === "name" || k === "owner") i[k] = el.value;
  else if (k === "ret" || k === "step") i[k] = num(el.value)/100;
  else if (k === "until" || k === "avail") i[k] = el.value === "" ? null : Math.round(num(el.value));
  else i[k] = mnum(el.value);
}
function applyGoal(id, el){
  const g = state.goals.find(x => x.id === id); if (!g) return;
  const k = el.dataset.gl;
  if (k === "on") g.on = el.checked;
  else if (k === "ess") g.ess = el.checked;
  else if (k === "name") g.name = el.value;
  else if (k === "infl") g.infl = num(el.value)/100;
  else if (k === "start" || k === "end") g[k] = Math.round(num(el.value));
  else g[k] = mnum(el.value);
  if (g.kind === "onetime") g.end = g.start;
}
function applyHist(tr, el){
  const h = state.history.find(x => x.id === tr.dataset.id); if (!h) return;
  const k = el.dataset.hs;
  if (k === "note") h.note = el.value;
  else if (k === "year") h.year = Math.round(num(el.value));
  else h[k] = mnum(el.value);
  /* a real figure typed into the estimated year retires the estimate, silently,
     and it is never derived over again */
  if (h.estimated && k === "actual"){
    delete h.estimated;
    if (String(h.note || "").startsWith("Estimated, not a recorded value")) h.note = "";
  }
}
