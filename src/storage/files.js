/* ============================================================== storage
   The file is the plan. The page keeps it in memory and in a file, nowhere
   else: no localStorage, no IndexedDB, no draft, no silent restore. The only
   two moments anything moves are Load and Save.

   What the browser supports decides how Save works:

     Chrome / Edge (File System Access)
                               1. folder picker → writes goal_plan.json there
                                  and keeps the copy it replaced as
                                  backups/goal_plan_<stamp>.json (last 10)
                               2. if the browser refuses a folder: "Save as…"
                                  picker; the replaced copy is downloaded
     Safari / Firefox          download goal_plan.json

   Load is the same everywhere: an ordinary file input, .json or legacy .js.

   Chrome remembers the last folder per picker `id` by itself, so the page
   stores nothing to make the second Save land in the same place.          */

const PLAN_FILE = "goal_plan.json";
const BACKUP_DIR = "backups";
const KEEP_BACKUPS = 10;
const PICKER_ID = "goal_planner";

/* Hands a file to the user as a normal browser download. */
function offerDownload(filename, text, mime){
  return Promise.resolve(linkDownload(filename, text, mime)
    ? {ok:true, how:"link"} : {ok:false, error:"Could not start the download."});
}

function linkDownload(filename, text, mime){
  try {
    const url = URL.createObjectURL(new Blob([text], {type:(mime || "application/json") + ";charset=utf-8"}));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch(e){ return false; }
}

function saveMode(){
  if (typeof window.showDirectoryPicker === "function") return "folder";
  if (typeof window.showSaveFilePicker === "function") return "file";
  return "download";
}

const isAbort = e => e && (e.name === "AbortError");

/* ------------------------------------------------------------ load */
/* Resolves {ok, loaded, name, kind} or {ok:false, error}. Nothing is adopted
   here: the caller checks it and decides. */
function readPlanFile(file){
  return new Promise(resolve => {
    const fr = new FileReader();
    fr.onerror = () => resolve({ok:false, error:"Could not read that file."});
    fr.onload = () => {
      let loaded;
      try { loaded = parsePlanText(fr.result); }
      catch(e){ resolve({ok:false, error:`${file.name} is not a plan file (it is not valid JSON).`}); return; }
      if (!looksLikePlan(loaded)){ resolve({ok:false, error:`${file.name} does not look like a plan — no holdings or goals in it.`}); return; }
      resolve({ok:true, loaded, text: fr.result, name:file.name, kind: /\.json$/i.test(file.name) ? "json" : "js"});
    };
    fr.readAsText(file);
  });
}

/* ------------------------------------------------------------ save */
async function readText(fileHandle){
  try { const f = await fileHandle.getFile(); return f.size ? await f.text() : ""; }
  catch(e){ return ""; }
}
async function writeText(fileHandle, text){
  const w = await fileHandle.createWritable();
  await w.write(text);
  await w.close();
}

/* one line describing a plan file's contents, for the replace question */
function describePlanText(text){
  try {
    const p = parsePlanText(text);
    const on = (p.investments || []).filter(i => i.on !== false);
    const tot = on.reduce((t,i) => t + num(i.val), 0);
    return `${on.length} holding${on.length === 1 ? "" : "s"}, ${(p.goals || []).length} goals, ${short(tot)}`
      + (p.savedAt ? `, saved ${new Date(p.savedAt).toLocaleString("en-IN", {dateStyle:"medium", timeStyle:"short"})}` : "");
  } catch(e){ return "not readable as a plan"; }
}

async function exists(dir, name){
  try { await dir.getFileHandle(name); return true; } catch(e){ return false; }
}

/* Keep the newest KEEP_BACKUPS timestamped files; never touch anything else. */
async function pruneBackups(dir){
  const names = [];
  for await (const [name, h] of dir.entries())
    if (h.kind === "file" && /^goal_plan_\d{8}-\d{6}(-\d+)?\.json$/.test(name)) names.push(name);
  names.sort();
  const drop = names.slice(0, Math.max(0, names.length - KEEP_BACKUPS));
  for (const n of drop){ try { await dir.removeEntry(n); } catch(e){ /* leave it */ } }
  return drop.length;
}

/* opts.confirmReplace(where, summary) → Promise<boolean>. Asked only when the
   file about to be replaced is not the one this plan came from — judged by
   content (opts.isKnown), since a file input never reveals its folder. */
async function savePlanText(text, opts){
  const mode = saveMode();
  const stamp = backupName(new Date());

  if (mode === "folder"){
    let dir;
    try { dir = await window.showDirectoryPicker({id: PICKER_ID, mode: "readwrite", startIn: "documents"}); }
    catch(e){
      if (isAbort(e)) return {ok:false, cancelled:true};
      /* SecurityError/NotAllowedError: this page may not use a folder here.
         Fall through to the single-file route rather than give up. */
      return savePlanFile(text, opts, stamp, "Chrome would not let this page use a folder, so it saved a single file instead.");
    }
    let target, existing = "";
    try { target = await dir.getFileHandle(PLAN_FILE); existing = await readText(target); }
    catch(e){ target = null; }
    if (existing && opts && opts.confirmReplace && !opts.isKnown(existing)){
      const go = await opts.confirmReplace(`${dir.name}/${PLAN_FILE}`, describePlanText(existing));
      if (!go) return {ok:false, cancelled:true};
    }
    let backup = null, pruned = 0;
    if (existing && existing.trim() !== text.trim()){
      const bdir = await dir.getDirectoryHandle(BACKUP_DIR, {create: true});
      /* two saves inside one second must not overwrite each other's backup */
      let name = stamp;
      for (let k = 1; await exists(bdir, name); k++) name = stamp.replace(/\.json$/, `-${k}.json`);
      const bh = await bdir.getFileHandle(name, {create: true});
      await writeText(bh, existing);
      backup = `${BACKUP_DIR}/${name}`;
      pruned = await pruneBackups(bdir);
    }
    if (!target) target = await dir.getFileHandle(PLAN_FILE, {create: true});
    await writeText(target, text);
    return {ok:true, where: `${dir.name}/${PLAN_FILE}`, source: dir.name, backup, pruned, mode};
  }

  if (mode === "file") return savePlanFile(text, opts, stamp, null);

  const r = await offerDownload(PLAN_FILE, text, "application/json");
  if (!r.ok) return r.declined ? {ok:false, cancelled:true} : {ok:false, error:r.error};
  return {ok:true, where: `${PLAN_FILE} (downloaded)`, source: null, backup: null, mode};
}

async function savePlanFile(text, opts, stamp, note){
  let fh;
  try {
    fh = await window.showSaveFilePicker({id: PICKER_ID, suggestedName: PLAN_FILE, startIn: "documents",
      types: [{description: "Goal plan", accept: {"application/json": [".json"]}}]});
  } catch(e){
    if (isAbort(e)) return {ok:false, cancelled:true};
    const r = await offerDownload(PLAN_FILE, text, "application/json");
    return r.ok ? {ok:true, where:`${PLAN_FILE} (downloaded)`, source:null, backup:null, mode:"download",
                   note:"This browser would not open a save dialog here, so the plan was downloaded."}
                : {ok:false, error:r.error || "Could not save."};
  }
  const existing = await readText(fh);
  if (existing && opts && opts.confirmReplace && !opts.isKnown(existing)){
    const go = await opts.confirmReplace(fh.name, describePlanText(existing));
    if (!go) return {ok:false, cancelled:true};
  }
  let backup = null;
  if (existing && existing.trim() !== text.trim()){
    /* A file grant does not reach the file's neighbours, so the replaced copy
       cannot go beside it. Say where it really went. */
    const r = await offerDownload(stamp, existing, "application/json");
    if (r.ok) backup = `${stamp} in your Downloads folder`;
  }
  await writeText(fh, text);
  return {ok:true, where: fh.name, source: fh.name, backup, mode:"file", note};
}
