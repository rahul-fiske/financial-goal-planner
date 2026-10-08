/* Lifted from the v37 planner page (_archive/v37_reference) on 2026-09-19; edited since. */
/* ------------------------------------------------------------- rendering */
function render(){
  recompute();
  verdict();
  const main = document.getElementById("main");
  const roll = rollNote ? `<div class="rollnote"><div><b>A new year has started.</b>
      ${rollNote.years.length === 1 ? rollNote.years[0] + " has closed" : rollNote.years.join(", ") + " have closed"}
      and now counts towards the on-track comparison, and ${rollNote.to} has opened. Check that the closing
      figure for ${rollNote.years[rollNote.years.length-1]} is the real year-end one, then update the holdings
      on the Portfolio tab to what they are worth now.</div>
      <div class="acts"><button class="btn" id="rollUndoBtn">Undo</button>
      <button class="btn" id="rollOkBtn">Got it</button></div></div>` : "";
  if (activeTab === "dash")      main.innerHTML = dashTab();
  else if (activeTab === "inv")  main.innerHTML = investmentsTab();
  else if (activeTab === "goals")main.innerHTML = goalsTab();
  else if (activeTab === "hist") main.innerHTML = historyTab();
  else                           main.innerHTML = yearsTab();
  if (roll) main.insertAdjacentHTML("afterbegin", roll);
  if (activeTab === "dash") paintCharts();
}

/* soft update: recompute and repaint everything except live input fields */
function softUpdate(){
  recompute();
  verdict();
  if (activeTab === "dash"){
    const set = (sel, html) => { const el = document.querySelector(sel); if (el) el.innerHTML = html; };
    const secs = document.querySelectorAll("#main > section");
    if (secs[0]) secs[0].innerHTML = banner();
    if (secs[1]) secs[1].innerHTML = tiles();
    if (secs[3]) secs[3].querySelector(".fixgrid, .callout")?.replaceWith(nodeFrom(fixes()));
    if (secs[4]) { const p = secs[4].querySelector(".panel"); if (p) p.replaceWith(nodeFrom(goalTable())); }
    void set;
    paintCharts();
  } else if (activeTab === "inv"){
    const tv = state.investments.filter(i=>i.on).reduce((t,i)=>t+num(i.val),0);
    const ta = state.investments.filter(i=>i.on).reduce((t,i)=>t+num(i.add),0);
    const a = document.querySelector('[data-live="ivTotal"]'); if (a) a.textContent = inr(tv);
    const b = document.querySelector('[data-live="ivAdd"]');   if (b) b.textContent = inr(ta);
    const c = document.querySelector('[data-live="ivRet"]');   if (c) c.textContent = "blended " + pct(MODEL.proj.m.blendedReturn,2);
  } else if (activeTab === "hist"){
    const t = MODEL.trk;
    t.rows.forEach(r => {
      const p = document.querySelector(`[data-planned="${r.id}"]`);
      const g = document.querySelector(`[data-gap="${r.id}"]`);
      if (p) p.textContent = r.planned != null ? short(r.planned) : "—";
      if (g){
        g.textContent = r.gap != null ? ((r.gap>=0?"+":"") + short(r.gap)) : "—";
        g.style.color = r.gap != null ? (r.gap>=0 ? "var(--good)" : "var(--critical)") : "var(--muted)";
      }
    });
    const box = document.getElementById("histChartBox");
    if (box){ const c = histChart(); box.innerHTML = c || ""; }
    const ro = document.getElementById("histReadout");
    if (ro) ro.innerHTML = histReadout();
  }
  markDirty();
}
function nodeFrom(html){ const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }

function paintCharts(){
  const cbox = document.getElementById("corpusBox");
  if (cbox){
    const c = corpusChart();
    cbox.innerHTML = c.svg + `<div class="tip" id="ctip"></div>`;
    wireCorpusHover(cbox, c);
  }
  const fbox = document.getElementById("flowBox");
  if (fbox){
    const f = flowChart();
    fbox.innerHTML = f.svg + `<div class="tip" id="ftip"></div>`;
    wireFlowHover(fbox, f);
  }
}

function hoverIndex(box, evt, count, mapX){
  const svg = box.querySelector("svg"), r = svg.getBoundingClientRect();
  const vx = (evt.clientX - r.left) / r.width * CW;
  let best = 0, bd = Infinity;
  for (let i = 0; i < count; i++){ const d = Math.abs(mapX(i) - vx); if (d < bd){ bd = d; best = i; } }
  return {i: best, rect: r};
}

function wireCorpusHover(box, c){
  const svg = box.querySelector("svg"), tip = box.querySelector("#ctip"), cx = svg.querySelector("#cx");
  const years = MODEL.proj.years;
  /* Every point on the purple "actually recorded" line gets its own tooltip too, built from the
     history row itself: Opening is the prior recorded year's Closing, and Plan would say /
     Difference reuse track()'s own numbers — the same ones the History tab shows. A row with
     nothing earlier to compare against (the very first one, or one track() can't yet place on
     the plan curve) just shows whatever it has, where only limited information is available. */
  const liveY = state.a.currentYear;
  const histRows = MODEL.trk.rows.filter(r => num(r.year) < liveY).sort((a,b) => num(a.year) - num(b.year));
  const candidates = histRows.map(r => ({kind:"hist", year:num(r.year), row:r}))
    .concat(years.map(y => ({kind:"proj", year:y.year, row:y})));
  const move = e => {
    const {i, rect} = hoverIndex(box, e, candidates.length, k => c.X(candidates[k].year));
    const cand = candidates[i];
    const row = (l,v,col) => `<div class="tr"><span>${col?`<span class="sw" style="background:${col}"></span>`:""}${l}</span><b>${v}</b></div>`;
    let px, py, html;

    if (cand.kind === "proj"){
      const y = cand.row;
      px = c.X(y.year); py = c.Y(y.closing);
      const rqAll = reqEndFor(years, reqCurve); const rq = rqAll ? rqAll[years.indexOf(y)] : null;
      html = `<div class="th">${y.year} &middot; age ${y.age}${y.phase==="Retirement"?" &middot; retired":""}</div>`
        + row("Opening", short(y.opening))
        + (y.contribution ? row("Invested", short(y.contribution), "var(--s1)") : "")
        + row("Growth", short(y.growth), "var(--s2)")
        + (y.goalSpend ? row("Goals", "−"+short(y.goalSpend), "var(--s3)") : "")
        + (y.tax ? row("Tax", "−"+short(y.tax), "var(--s5)") : "")
        + (y.retSpend ? row("Living costs", "−"+short(y.retSpend), "var(--s4)") : "")
        + row("<b>Closing</b>", "<b>"+short(y.closing)+"</b>")
        + (y.shortfall > 1 ? `<div class="tr" style="color:var(--critical)"><span>Unfunded</span><b>${short(y.shortfall)}</b></div>` : "")
        + (rq != null ? `<div class="tr" style="border-top:1px solid var(--line);margin-top:4px;padding-top:4px">
             <span>Needed by then</span><b>${short(rq)}</b></div>
           <div class="tr"><span>${y.closing - rq >= 0 ? "Surplus" : "Short by"}</span>
             <b style="color:${y.closing-rq>=0?"var(--good)":"var(--critical)"}">${short(Math.abs(y.closing-rq))}</b></div>` : "");
    } else {
      const r = cand.row;
      const idx = histRows.indexOf(r);
      const prev = idx > 0 ? histRows[idx-1] : null;
      const opening = prev ? num(prev.actual) : null;
      const invested = num(r.contribution);
      const growth = opening != null ? num(r.actual) - opening - invested : null;
      const age = state.a.currentAge + (num(r.year) - liveY);
      px = c.X(cand.year); py = c.Y(num(r.actual));
      let tail = "";
      if (r.estimated){
        tail = `<div class="tr" style="color:var(--muted);font-style:italic;border-top:1px solid var(--line);margin-top:4px;padding-top:4px">${esc(r.note || "Estimated, not a recorded value")}</div>`;
      } else if (r.planned != null){
        tail = `<div class="tr" style="border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><span>Plan would say</span><b>${short(r.planned)}</b></div>`
          + `<div class="tr"><span>Difference</span><b style="color:${r.gap>=0?"var(--good)":"var(--critical)"}">${(r.gap>=0?"+":"")+short(r.gap)}</b></div>`;
      } else if (opening == null){
        tail = `<div class="tr" style="color:var(--muted);font-style:italic">Earliest year recorded &mdash; nothing earlier to compare</div>`;
      }
      html = `<div class="th">${r.year} &middot; age ${age}${r.estimated?" &middot; estimated":""}</div>`
        + (opening != null ? row("Opening", short(opening)) : "")
        + (invested ? row("Invested", short(invested), "var(--s1)") : "")
        + (growth != null ? row("Growth", short(growth), "var(--s2)") : "")
        + row("<b>Closing</b>", "<b>"+short(num(r.actual))+"</b>")
        + tail;
    }

    cx.style.opacity = 1;
    cx.querySelector("line").setAttribute("x1", px); cx.querySelector("line").setAttribute("x2", px);
    cx.querySelector("circle").setAttribute("cx", px); cx.querySelector("circle").setAttribute("cy", py);
    tip.innerHTML = html;
    tip.style.opacity = 1;
    const sx = rect.width / CW;
    let left = px * sx + 14;
    if (left + 190 > rect.width) left = px * sx - 190;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = Math.max(0, Math.min(py * sx - 20, rect.height - 150)) + "px";
  };
  svg.addEventListener("mousemove", move);
  svg.addEventListener("mouseleave", () => { tip.style.opacity = 0; cx.style.opacity = 0; });
}

function wireFlowHover(box, f){
  const svg = box.querySelector("svg"), tip = box.querySelector("#ftip");
  const years = f.years;
  svg.addEventListener("mousemove", e => {
    const {i, rect} = hoverIndex(box, e, years.length, k => f.X(k));
    const y = years[i];
    const row = (l,v,col) => `<div class="tr"><span><span class="sw" style="background:${col}"></span>${l}</span><b>${v}</b></div>`;
    tip.innerHTML = `<div class="th">${y.year} &middot; age ${y.age}</div>`
      + (y.contribution ? row("Invested", short(y.contribution), "var(--s1)") : "")
      + row("Growth", short(y.growth), "var(--s2)")
      + (y.goalSpend ? row("Goal spending", short(y.goalSpend), "var(--s3)") : "")
      + (y.retSpend ? row("Living costs", short(y.retSpend), "var(--s4)") : "")
      + (y.tax ? row("Tax", short(y.tax), "var(--s5)") : "")
      + (y.shortfall > 1 ? `<div class="tr" style="color:var(--critical)"><span><span class="sw" style="background:var(--crit-wash);outline:1px dashed var(--critical)"></span>Needed but not paid</span><b>${short(y.shortfall)}</b></div>` : "")
      + `<div class="tr" style="border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><span>Net</span><b>${short(y.contribution+y.growth-y.outflow)}</b></div>`;
    tip.style.opacity = 1;
    const sx = rect.width / CW;
    let left = f.X(i) * sx + 14;
    if (left + 190 > rect.width) left = f.X(i) * sx - 190;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = "10px";
  });
  svg.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
}
