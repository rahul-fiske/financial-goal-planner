/* ================================================================== app
   The shell: page state, header, the empty state, Load / Save wiring, the
   unsaved counter and the boot. Replaces the whole persistence section of
   the v37 planner page (_archive/v37_reference).

   The page always opens EMPTY. Nothing is remembered between sessions: a
   plan enters only through Load (or the sample) and leaves only through
   Save. See src/storage/files.js for how Save works where.               */

let state = null;          // the plan, in memory only; null = nothing open
let MODEL = null;
let activeTab = "dash";
let reqCurve = null, reqTimer = null;
let rollNote = null, rollUndo = null;

/* what the header needs to know about the plan that is open */
const DOC = {
  origin: null,            // "file" | "sample"
  name: null,              // what to call it in the header
  knownText: null,         // the bytes last read from / written to disk
  dirty: false,
  since: null              // when it was opened or last saved
};

const APP_VERSION = "__BUILD_VERSION__";

/* ---------------------------------------------------------- recompute */
function recompute(){
  normalize(state);
  ensureEstimate(state);          // keeps a still-estimated year in step with the one it came from
  const proj = project(state);
  MODEL = {proj, trk: track(state), fix: solveAll(state)};
  scheduleRequired();
  return MODEL;
}

/* The required curve costs a few hundred milliseconds, far too much for every
   keystroke, so it is computed once editing settles. While stale, the old one
   stays on the chart; it is dropped only when the year count changes. */
function scheduleRequired(){
  if (reqTimer) clearTimeout(reqTimer);
  reqTimer = setTimeout(() => {
    reqTimer = null;
    if (!state || !MODEL) return;
    try { reqCurve = requiredCurve(state, MODEL.proj); }
    catch(e){ reqCurve = null; }
    if (activeTab === "dash") paintCharts();
    if (activeTab === "years") render();
  }, 260);
}

/* ------------------------------------------------------------- export */
function exportCsv(){
  const ys = MODEL.proj.years;
  let rq = reqEndFor(ys, reqCurve);
  if (!rq){ try { reqCurve = requiredCurve(state, MODEL.proj); rq = reqEndFor(ys, reqCurve); } catch(e){ rq = null; } }
  offerDownload("goal_planner_projection.csv", toCsv(yearRows(state, ys, rq)), "text/csv")
    .then(r => {
      if (r.ok) flash("downloaded");
      else if (!r.declined) flash("could not download");
    });
}

/* ------------------------------------------------------------ messages */
function flash(msg){
  const el = document.getElementById("saveInd");
  if (!el || !msg) return;
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 2600);
}
function notice(kind, html){
  const box = document.getElementById("notices");
  if (!box) return null;
  const el = document.createElement("div");
  el.className = "notice" + (kind === "warn" ? " warn" : "");
  el.innerHTML = `<div>${html}</div><button class="x" aria-label="Dismiss">&times;</button>`;
  el.querySelector(".x").addEventListener("click", () => el.remove());
  box.appendChild(el);
  return el;
}
function clearNotices(){ const b = document.getElementById("notices"); if (b) b.innerHTML = ""; }

/* An in-page question, not a browser confirm box: nothing modal, and the
   answer buttons sit where the eye already is. */
function askInline(html, yes, no){
  return new Promise(resolve => {
    const box = document.getElementById("notices");
    const el = document.createElement("div");
    el.className = "notice warn ask";
    el.innerHTML = `<div>${html}</div><div class="acts">
      <button class="btn btn-accent" data-a="1">${esc(yes)}</button>
      <button class="btn" data-a="0">${esc(no)}</button></div>`;
    el.addEventListener("click", e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      el.remove(); resolve(b.dataset.a === "1");
    });
    box.prepend(el);
    el.querySelector("[data-a='1']").focus();
  });
}

/* ------------------------------------------------------------- dirty */
function markDirty(){
  if (!state) return;
  DOC.dirty = true;
  paintStatus();
}

function ago(d){
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60);
  return h + " h " + (min % 60) + " min";
}

function paintStatus(){
  const pill = document.getElementById("storePill"), txt = document.getElementById("storeTxt");
  const save = document.getElementById("planSave");
  if (!pill) return;
  if (!state){
    pill.className = "storepill"; txt.textContent = "no plan open";
    pill.title = "Load a plan file, or start from the sample.";
  } else if (DOC.dirty){
    pill.className = "storepill warn";
    const a = ago(DOC.since);
    txt.textContent = DOC.origin === "sample" && !DOC.knownText
      ? "unsaved sample — " + (a === "just now" ? "started just now" : a + " since you started")
      : "unsaved — " + (a === "just now" ? "changed since last save" : a + " since last save");
    pill.title = "Changes are only in this tab. Closing it loses them. Press Save.";
  } else {
    pill.className = "storepill live";
    txt.textContent = DOC.name;
    pill.title = "What you see matches the file.";
  }
  if (save){
    save.hidden = !state;
    save.className = "btn" + (state && DOC.dirty ? " btn-accent" : "");
  }
}

/* ------------------------------------------------------------- shell */
function shellHtml(){
  return `
<div class="safety" role="note">
  <div class="wrap safetyin">
    <span><b>Your figures never leave your computer.</b> This page has no server and keeps no copy of anything:
    <b>Load</b> reads a plan file inside your browser, and <b>Save</b> puts it back
    on your own disk. Close the tab and nothing is left behind.</span>
  </div>
</div>
<div class="top">
  <div class="wrap">
    <div class="topin">
      <div class="brand">
        <h1>Goal Planner</h1>
        <span class="sub">Financial plan &middot; ${esc(APP_VERSION)}</span>
      </div>
      <div id="verdictPill"></div>
      <div class="planbar">
        <span class="storepill" id="storePill"><span class="dot"></span><span id="storeTxt">no plan open</span></span>
        <button class="btn" id="planLoad" title="Open a goal_plan.json (or an older plan.js) from your computer">Load plan&hellip;</button>
        <button class="btn" id="planSave" hidden
          title="${saveMode() === "download"
            ? "Downloads goal_plan.json"
            : "Asks for a folder, writes goal_plan.json there, and keeps the copy it replaces in backups/"}">${saveMode() === "download" ? "Download plan" : "Save plan&hellip;"}</button>
        <input type="file" id="planFile" accept=".json,.js,application/json,text/javascript" hidden>
      </div>
      <div class="saveind" id="saveInd" aria-live="polite"></div>
    </div>
    <div class="tabs" role="tablist" id="tabs" hidden>
      <button class="tab" role="tab" data-tab="dash" aria-selected="true">Dashboard</button>
      <button class="tab" role="tab" data-tab="inv" aria-selected="false">Portfolio</button>
      <button class="tab" role="tab" data-tab="goals" aria-selected="false">Goals</button>
      <button class="tab" role="tab" data-tab="hist" aria-selected="false">History</button>
      <button class="tab" role="tab" data-tab="years" aria-selected="false">Year by year</button>
    </div>
  </div>
</div>
<div id="notices"></div>
<main class="wrap" id="main"></main>`;
}

/* The page ALWAYS opens here. Two ways in, nothing else. */
function renderWelcome(){
  document.getElementById("tabs").hidden = true;
  document.getElementById("verdictPill").innerHTML = "";
  document.getElementById("main").innerHTML = `
    <section class="welcome panel">
      <h2>Open a plan to begin</h2>
      <p>Nothing is open. This page does not remember anything from last time.</p>
      <div class="wbtns">
        <button class="btn btn-accent btn-lg" id="welcomeLoad">Load a plan&hellip;</button>
        <button class="btn btn-lg" id="welcomeSample">Start with a sample plan</button>
      </div>
      <p class="hint">A plan is a <code>goal_plan.json</code> file. An older <code>plan.js</code> opens too.</p>
    </section>`;
  paintStatus();
}

function showPlan(){
  document.getElementById("tabs").hidden = false;
  activeTab = "dash";
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === "dash")));
  reqCurve = null;
  render();
  paintStatus();
}

/* ------------------------------------------------------------- load */
async function loadFile(file){
  if (state && DOC.dirty){
    const go = await askInline(`<b>${esc(DOC.name)}</b> has changes that are not saved. Open <b>${esc(file.name)}</b> and lose them?`,
      "Discard changes and open", "Keep editing");
    if (!go) return;
  }
  const r = await readPlanFile(file);
  if (!r.ok){ notice("warn", esc(r.error)); return; }
  const m = merge(r.loaded);
  if (!m.ok){
    notice("warn", m.error === "newer"
      ? `<b>${esc(file.name)} was written by a newer version of the planner</b> (data v${m.dataVersion}; this page reads up to v${m.pageVersion}). It has been left untouched &mdash; open it with the newer page.`
      : `<b>${esc(file.name)}</b> could not be opened as a plan.`);
    return;
  }
  clearNotices();
  state = m.state;
  const rn = rollForward(state, new Date());
  rollNote = rn; rollUndo = rn ? rn.undo : null;
  const est = ensureEstimate(state);
  Object.assign(DOC, {origin: "file", name: file.name, knownText: r.text,
                      dirty: !!rn || r.kind === "js" || est, since: new Date()});
  showPlan();
  if (est){
    const e = state.history.find(h => h.estimated);
    notice("", `<b>Added an estimated ${e.year} to History.</b> With only one recorded year there was nothing to compare; `
      + `the estimate gives the chart a slope but is left out of the on-track figures. Type the real ${e.year} value to replace it.`);
  }
  if (r.kind === "js")
    notice("", `<b>Opened ${esc(file.name)}, an older-format plan.</b> Save writes it as <b>goal_plan.json</b>; `
      + `${esc(file.name)} itself is left exactly as it is.`);
}

function startSample(){
  state = merge(defaultState()).state;
  const rn = rollForward(state, new Date());
  rollNote = rn; rollUndo = rn ? rn.undo : null;
  Object.assign(DOC, {origin: "sample", name: "sample plan", knownText: null, dirty: true, since: new Date()});
  clearNotices();
  showPlan();
  notice("", `<b>Sample figures &mdash; a made-up household, not anybody's real accounts.</b> Type over anything on the `
    + `Portfolio, Goals and History tabs. Nothing is saved until you press <b>${saveMode() === "download" ? "Download plan" : "Save plan"}</b>.`);
}

/* ------------------------------------------------------------- save */
let saving = false;
async function doSave(){
  if (!state || saving) return;
  saving = true;
  const btn = document.getElementById("planSave");
  if (btn) btn.disabled = true;
  try {
    const prevSavedAt = state.savedAt;
    state.savedAt = new Date().toISOString();
    const text = serialiseJson(state);
    const folderish = saveMode() !== "download";
    const r = await savePlanText(text, {
      isKnown: t => !!DOC.knownText && t.trim() === DOC.knownText.trim(),
      confirmReplace: (where, summary) => askInline(
        `<b>${esc(where)}</b> already holds a different plan (${esc(summary)}). Replace it with the one on screen?`
        + (folderish ? " The file it replaces will be kept in <b>backups/</b>." : ""),
        "Replace it", "Cancel")
    });
    if (!r.ok){
      state.savedAt = prevSavedAt;
      if (r.error) notice("warn", `<b>Not saved.</b> ${esc(r.error)}`);
      else flash("not saved");
      return;
    }
    Object.assign(DOC, {origin: "file", name: r.where, knownText: text, dirty: false, since: new Date()});
    clearNotices();
    let msg = r.mode === "download"
      ? `<b>Downloaded goal_plan.json.</b> It is in your browser's downloads; move it wherever you keep your plan.`
      : `<b>Saved to ${esc(r.where)}.</b>`;
    if (r.backup) msg += ` The copy it replaced is kept as <b>${esc(r.backup)}</b>.`;
    if (r.pruned) msg += ` (${r.pruned} older backup${r.pruned > 1 ? "s" : ""} removed; the newest ${KEEP_BACKUPS} are kept.)`;
    if (r.note) msg += " " + esc(r.note);
    notice("", msg);
    flash("saved");
  } catch(e){
    notice("warn", `<b>Not saved.</b> ${esc(e && e.message || String(e))}`);
  } finally {
    saving = false;
    if (btn) btn.disabled = false;
    paintStatus();
  }
}

/* ------------------------------------------------------------- boot */
function boot(){
  const root = document.getElementById("gp-root");
  root.innerHTML = shellHtml();
  wireEvents();

  const file = document.getElementById("planFile");
  const pick = () => { file.value = ""; file.click(); };
  file.addEventListener("change", () => { const f = file.files && file.files[0]; if (f) loadFile(f); });
  document.getElementById("planLoad").addEventListener("click", pick);
  document.getElementById("planSave").addEventListener("click", doSave);
  document.getElementById("main").addEventListener("click", e => {
    if (e.target.id === "welcomeLoad") pick();
    if (e.target.id === "welcomeSample") startSample();
  });

  /* Losing work silently is worth one dialog. */
  window.addEventListener("beforeunload", e => {
    if (!state || !DOC.dirty) return;
    e.preventDefault(); e.returnValue = "";
  });
  setInterval(paintStatus, 30000);

  renderWelcome();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
