/* Lifted from the v37 planner page (_archive/v37_reference) on 2026-09-19; edited since. */
/* ================================================================ render */
/* The first year the goals are not met in full. This, not the year the corpus
   reaches zero, is when the money "runs short": a holding locked until later
   (NPS, say) can keep the corpus above zero for years while nothing can be
   paid out of it. */
function shortFrom(){
  const y = MODEL.proj.years.find(r => r.shortfall > 1);
  return y ? {year: y.year, age: y.age} : null;
}
/* money sitting in holdings that are still locked at the end of a year */
function lockedAt(year){
  const y = MODEL.proj.years.find(r => r.year === year);
  if (!y) return {total: 0, names: [], until: null};
  const hs = state.investments.filter(i => i.on && i.avail != null && num(i.avail) > year
    && y.byInv[i.id] && y.byInv[i.id].closing > 1);
  return {total: hs.reduce((t,i) => t + y.byInv[i.id].closing, 0), names: hs.map(i => i.name),
          until: hs.length ? Math.min.apply(null, hs.map(i => num(i.avail))) : null};
}

function verdict(){
  const m = MODEL.proj.m, sf = shortFrom();
  const el = document.getElementById("verdictPill");
  if (m.allFunded){
    el.innerHTML = `<span class="verdict-pill pill-ok"><span class="dot"></span>Every goal funded to age ${state.a.lifeExpectancy}</span>`;
  } else if (sf){
    el.innerHTML = `<span class="verdict-pill pill-bad"><span class="dot"></span>Money runs short at age ${sf.age} &middot; ${sf.year}</span>`;
  } else {
    el.innerHTML = `<span class="verdict-pill pill-bad"><span class="dot"></span>${short(m.totalShortfall)} of goals unfunded</span>`;
  }
}

function tiles(){
  const m = MODEL.proj.m;
  const sf = m.allFunded ? null : shortFrom();
  const runsTo = sf ? `age ${sf.age}` : `age ${state.a.lifeExpectancy}+`;
  return `<div class="tiles">
    <div class="tile"><div class="k">Corpus today</div><div class="v">${short(m.currentCorpus)}</div>
      <div class="m">${m.embeddedTaxNow > 0
        ? short(m.afterTaxNow) + " after the tax owed on gains"
        : inr(m.annualContribution) + " added each year"}</div></div>
    <div class="tile"><div class="k">At retirement &middot; ${m.retirementYear}</div><div class="v">${short(m.corpusAtRetirement)}</div>
      <div class="m">needs ${short(m.requiredAtRetirement)} for all goals</div></div>
    <div class="tile"><div class="k">Peak corpus</div><div class="v">${short(m.peakCorpus)}</div>
      <div class="m">in ${m.peakYear}</div></div>
    <div class="tile"><div class="k">${sf ? "Money runs short at" : "Money lasts to"}</div><div class="v ${sf?"bad":"good"}">${runsTo}</div>
      <div class="m">${sf ? short(m.totalShortfall)+" of spending unmet" : "with "+short(m.finalCorpus)+" left over"}</div></div>
  </div>`;
}

function banner(){
  const m = MODEL.proj.m;
  if (m.allFunded){
    return `<div class="banner ok"><div class="icon">✓</div><div>
      <h2>The plan holds all the way to age ${state.a.lifeExpectancy}</h2>
      <p>Every goal is paid in full and ${short(m.finalCorpus)} is still left at the end. Retirement at ${state.a.retirementAge} works on these assumptions.</p>
    </div></div>`;
  }
  const worst = MODEL.proj.goalStatus.filter(g => g.status !== "Funded" && g.status !== "Not scheduled");
  const names = worst.map(g => g.name).join(", ");
  const sf = shortFrom();
  const lk = sf ? lockedAt(sf.year) : {total: 0};
  const lockNote = lk.total > 1
    ? ` ${short(lk.total)} is still there that year, but it is locked in ${esc(lk.names.join(", "))} until ${lk.until}.` : "";
  return `<div class="banner"><div class="icon">⚠</div><div>
    <h2>${sf ? `The money runs short at age ${sf.age}, in ${sf.year}` : "Some goals go unfunded"}</h2>
    <p>Retiring at ${state.a.retirementAge} leaves ${short(m.corpusAtRetirement)} against the ${short(m.requiredAtRetirement)} these goals actually need &mdash; a gap of ${short(Math.abs(m.surplus))}.
    ${names ? `Falls short on: <b>${esc(names)}</b>.` : ""} Total unmet spending over the plan: ${short(m.totalShortfall)}.${lockNote}</p>
  </div></div>`;
}

function fixes(){
  const f = MODEL.fix, m = MODEL.proj.m;
  const ok = m.allFunded;
  const now = m.annualContribution;
  const need = (f.contribMult != null) ? now * f.contribMult : null;
  const retGoal = state.goals.find(g => g.isRet && g.on);

  /* ---- the headline: one signed number, per year and per month --------- */
  let big, sub;
  if (need != null && now > 0){
    const diff = now - need;
    if (Math.abs(diff) < Math.max(now, 1) * 0.005){
      big = `<span>Invested to the rupee</span>`;
      sub = `What you put away each year is almost exactly what these goals need. There is no slack either way.`;
    } else if (diff > 0){
      big = `<span class="good">${short(diff)} a year spare</span>`;
      sub = need <= 0
        ? `You are investing ${inr(now)} a year &mdash; ${inr(now/12)} a month. On these assumptions every goal is
           met even if you stopped investing entirely tomorrow, so all of it is building margin.`
        : `You are investing ${inr(now)} a year. Every goal is met on ${inr(need)} &mdash; you are putting away about
           ${inr(diff/12)} a month more than the plan needs.`;
    } else {
      big = `<span class="bad">${short(-diff)} a year short</span>`;
      sub = `You are investing ${inr(now)} a year. These goals need ${inr(need)} &mdash; about
             ${inr(-diff/12)} a month more than you are putting away.`;
    }
  } else if (need != null && now <= 0){
    big = ok ? `<span class="good">Nothing more needed</span>` : `<span class="bad">${short(need)} a year needed</span>`;
    sub = ok ? `Every goal is met with no further investing at all.`
             : `You are investing nothing at present. These goals need ${inr(need)} a year.`;
  } else {
    big = `<span class="bad">Investing cannot close it</span>`;
    sub = `Even at twenty times the current amount the goals are not met in the
           ${m.retirementYear - state.a.currentYear} year${m.retirementYear-state.a.currentYear>1?"s":""}
           left to invest. Retiring later or spending less has to do the work.`;
  }

  /* ---- two bars: what goes in, against what the goals require ---------- */
  let bars = "";
  if (need != null && (now > 0 || need > 0)){
    const top = Math.max(now, need, 1);
    const row = (lbl, v, colour) => `<div class="barrow"><span class="lbl">${lbl}</span>
      <div class="track"><div class="fill" style="width:${Math.max(v/top*100, 1.5).toFixed(1)}%;background:${colour}"></div></div>
      <span class="val">${short(v)}</span></div>`;
    bars = `<div class="bars">
      ${row("You invest", now, "var(--s1)")}
      ${row("Goals need", need, need > now ? "var(--critical)" : "var(--good)")}
      <div class="barrow"><span class="lbl"></span>
        <span style="font-size:12px;color:var(--muted);grid-column:2 / span 2">a year, for the
        ${m.retirementYear - state.a.currentYear} year${m.retirementYear-state.a.currentYear>1?"s":""} of investing left</span></div>
    </div>`;
  }

  const stand = `<div class="stand"><div class="verdict"><div class="big">${big}</div>
    <span class="sub">${sub}</span></div>${bars}</div>`;

  /* ---- the four levers, each signed ------------------------------------ */
  const cards = [];

  if (f.lumpToday != null){
    const spare = f.lumpToday >= 0;
    /* the solver caps removal at the corpus, so equality means the whole lot
       is spare — the money going in from here carries the plan by itself */
    const wholeLot = spare && f.lumpToday >= m.currentCorpus - 1;
    cards.push(`<div class="fix"><div class="lever">Capital today</div>
      <div class="big ${spare?"good":"bad"}">${wholeLot ? "All of it" : short(Math.abs(f.lumpToday))}</div>
      <div class="from">${wholeLot ? `the whole ${short(m.currentCorpus)} is spare`
        : spare ? "could come out of the corpus now" : "would have to go in now"}</div>
      <p>${wholeLot
        ? `Even starting from nothing today, what you invest from here funds every goal to age ${state.a.lifeExpectancy}. Nothing in the corpus is committed.`
        : spare
        ? `Take that much out today, change nothing else, and every goal is still met to age ${state.a.lifeExpectancy}. It is the corpus that is not spoken for.`
        : `A one-off addition of this size fixes the plan on its own, with the same investing, the same retirement age and the same spending.`}</p></div>`);
  }

  if (f.retireAge != null && f.retireAge !== state.a.retirementAge){
    const d = f.retireAge - state.a.retirementAge, earlier = d < 0;
    cards.push(`<div class="fix"><div class="lever">${earlier ? "Stop earlier" : "Work longer"}</div>
      <div class="big ${earlier?"good":"bad"}">Retire at ${f.retireAge}</div>
      <div class="from">instead of ${state.a.retirementAge} &mdash; ${Math.abs(d)} year${Math.abs(d)>1?"s":""} ${earlier?"earlier":"later"}</div>
      <p>${earlier
        ? `The earliest age this corpus can carry every goal to ${state.a.lifeExpectancy}. Working past it builds cushion rather than covering a gap.`
        : `Contributions keep running and the corpus gets ${d} more year${d>1?"s":""} to compound before drawdown starts.`}</p></div>`);
  }

  if (need != null && now > 0){
    const less = need < now;
    cards.push(`<div class="fix"><div class="lever">${less ? "Invest less" : "Invest more"}</div>
      <div class="big ${less?"good":"bad"}">${short(need)}<span style="font-size:14px;color:var(--muted)">/yr</span></div>
      <div class="from">${inr(need/12)} a month, ${less?"down":"up"} from ${inr(now/12)}</div>
      <p>${less
        ? `The least that funds every goal while keeping retirement at ${state.a.retirementAge}. Anything above it is building margin.`
        : `Keeping retirement at ${state.a.retirementAge} works only if annual investing rises to this level for the next ${m.retirementYear - state.a.currentYear} year${m.retirementYear-state.a.currentYear>1?"s":""}.`}</p></div>`);
  }

  if (f.sustainable != null && retGoal){
    const cur = num(retGoal.amt), more = f.sustainable > cur;
    cards.push(`<div class="fix"><div class="lever">${more ? "Spend more" : "Spend less"}</div>
      <div class="big ${more?"good":"bad"}">${short(f.sustainable)}<span style="font-size:14px;color:var(--muted)">/yr</span></div>
      <div class="from">${inr(f.sustainable/12)} a month, ${more?"up":"down"} from ${inr(cur/12)} in today's money</div>
      <p>The largest retirement spend this corpus carries to age ${state.a.lifeExpectancy}, still paying every other goal in full.
      That is ${pct(Math.abs(f.sustainable/(cur||1) - 1))} ${more?"above":"below"} what you have planned.</p></div>`);
  }

  return stand + `<div class="fixgrid">${cards.join("")}</div>`;
}

function goalTable(){
  const gs = MODEL.proj.goalStatus;
  if (!gs.length) return `<div class="panel"><div class="empty">No goals yet. Add one on the Goals tab.</div></div>`;
  const cls = s => s === "Funded" ? "s-funded" : s === "Partial" ? "s-partial" : s === "Unfunded" ? "s-unfunded" : "s-none";
  const rows = gs.map(g => {
    const when = g.kind === "onetime" ? String(g.start) : `${g.start}–${g.end}`;
    const corpus = MODEL.proj.years.find(y => y.year === g.start);
    return `<tr>
      <td><b>${esc(g.name)}</b>${g.ess?"":' <span class="pillsm">optional</span>'}</td>
      <td><span class="pillsm">${g.kind === "onetime" ? "one-time" : "recurring"}</span></td>
      <td class="mono">${when}</td>
      <td class="mono r">${short(g.due)}</td>
      <td class="mono r">${short(g.paid)}</td>
      <td class="mono r" style="color:${g.short>1?"var(--critical)":"var(--muted)"}">${g.short > 1 ? short(g.short) : "—"}</td>
      <td class="mono r">${corpus ? short(corpus.opening) : "—"}</td>
      <td><span class="status ${cls(g.status)}"><span class="g"></span>${g.status}${g.firstShort?` from ${g.firstShort}`:""}</span></td>
    </tr>`;
  }).join("");
  return `<div class="panel"><div class="tblwrap"><table>
    <thead><tr><th>Goal</th><th>Type</th><th>When</th><th class="r">Cost then</th><th class="r">Funded</th><th class="r">Short by</th><th class="r">Corpus at start</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function assumptionsPanel(){
  const s = state, ry = A.retYear(s), ey = A.endYear(s), on = !!s.a.usePostRet;
  const f = (label, key, val, stepv, hint) =>
    `<div class="fld"><label for="a_${key}">${label}</label>
     <input type="number" id="a_${key}" data-as="${key}" value="${val}" step="${stepv}">
     ${hint?`<span class="hint">${hint}</span>`:""}</div>`;
  return `<div class="panel panel-pad">
    <div class="asmp">
      ${f("Current age","currentAge",s.a.currentAge,1)}
      ${f("Retirement age","retirementAge",s.a.retirementAge,1,"contributions stop here")}
      ${f("Plan until age","lifeExpectancy",s.a.lifeExpectancy,1)}
      <div class="fld"><label>Retirement year</label><div class="derived">${ry}</div><span class="hint">age ${s.a.retirementAge}</span></div>
      <div class="fld"><label>Plan ends</label><div class="derived">${ey}</div><span class="hint">${ey - s.a.currentYear + 1} years modelled</span></div>

      <div class="fld fld-wide"><label>Return after retiring</label>
        <div class="retgrp">
          <label class="chk" for="a_usePostRet" style="padding-top:0">
            <input type="checkbox" id="a_usePostRet" data-as="usePostRet"${on?" checked":""}>
            <span>Switch everything to one return once retired</span></label>
          <div class="pct">
            <input type="number" id="a_postRetReturn" data-as="postRetReturn"
              value="${(s.a.postRetReturn*100).toFixed(2)}" step="0.25"${on?"":" disabled"}>
            <span style="font-size:13px;color:var(--muted)">% a year</span>
          </div>
          <div class="why">${on
            ? `From ${ry} this rate replaces each holding's own Return %. Untick to let every holding keep its own rate for the whole plan.`
            : `Every holding keeps its own Return % for the whole plan. Tick the box to move them all to a single rate from ${ry}, the usual way of showing a shift out of equity at retirement.`}</div>
        </div>
      </div>
    </div></div>`;
}

/* A read-only version for the dashboard. The figures live on the Portfolio
   tab now; this is here so the reader can see what the results rest on
   without leaving the page. */
function assumptionsSummary(){
  const s = state, ry = A.retYear(s), ey = A.endYear(s), on = !!s.a.usePostRet;
  const it = (k,v,) => `<div class="it"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  return `<div class="panel panel-pad">
    <div class="asum">
      ${it("Age today", s.a.currentAge)}
      ${it("Retires", ry + " &middot; age " + s.a.retirementAge)}
      ${it("Plan runs to", s.a.lifeExpectancy + " &middot; " + ey)}
      ${it("After retiring", on ? pct(s.a.postRetReturn,2) + " on everything" : "each holding's own rate")}
      ${it("Values as of", asOfLabel(s))}
    </div>

  </div>`;
}

/* -------------------------------------------------------------- editors */
/* -------------------------------------------------------------- editors */

function investmentsTab(){
  const ry = A.retYear(state), s = state;
  const money = (k,v) => `<td><input class="w-num money" type="text" inputmode="numeric" data-iv="${k}" value="${IN.format(v)}"></td>`;
  const rows = s.investments.map(i => `<tr data-id="${i.id}">
    <td><input type="checkbox" data-iv="on" ${i.on?"checked":""} aria-label="include"></td>
    <td><input class="w-name" type="text" data-iv="name" value="${esc(i.name)}"></td>
    <td><select class="w-sel" data-iv="cat">${CATS.map(c=>`<option${c===i.cat?" selected":""}>${c}</option>`).join("")}</select></td>
    <td><input class="w-name" type="text" data-iv="owner" value="${esc(i.owner)}" style="min-width:110px"></td>
    ${money("val", i.val)}
    ${money("cost", num(i.cost, num(i.val)))}
    ${money("add", i.add)}
    <td><input class="w-yr" type="number" data-iv="step" value="${(num(i.step)*100).toFixed(1)}" step="1"></td>
    <td><input class="w-yr" type="number" data-iv="ret" value="${(num(i.ret)*100).toFixed(2)}" step="0.25"></td>
    <td><select class="w-sel" data-iv="taxWhen" style="min-width:196px">${
      TAX_WHEN.map(([k,l])=>`<option value="${k}"${k===i.taxWhen?" selected":""}>${l}</option>`).join("")}</select></td>
    <td><input class="w-yr" type="number" data-iv="taxRate" value="${(num(i.taxRate)*100).toFixed(1)}" step="0.5" min="0"></td>
    <td><input class="w-yr" type="number" data-iv="pri" value="${num(i.pri,50)}" step="1" min="1"></td>
    <td><input class="w-yr" type="number" data-iv="until" value="${i.until==null?"":i.until}" placeholder="${ry-1}"></td>
    <td><input class="w-yr" type="number" data-iv="avail" value="${i.avail==null?"":i.avail}" placeholder="now"></td>
    <td><button class="icon-btn" data-del="inv" aria-label="Remove ${esc(i.name)}">&#10005;</button></td>
  </tr>`).join("");
  const on = s.investments.filter(i=>i.on);
  const tv = on.reduce((t,i)=>t+num(i.val),0);
  const ta = on.reduce((t,i)=>t+num(i.add),0);
  const tc = on.reduce((t,i)=>t+num(i.cost,num(i.val)),0);
  const embedded = MODEL.proj.m.embeddedTaxNow;

  /* the order money is actually taken in, spelled out from the current numbers */
  const seen = {};
  on.forEach(i => seen[i.name] = (seen[i.name] || 0) + 1);
  const label = i => (seen[i.name] > 1 && i.owner) ? i.name + " (" + i.owner + ")" : i.name;
  const bands = {};
  on.forEach(i => { const p = num(i.pri,50); (bands[p] = bands[p] || []).push(label(i)); });
  const list = n => n.length === 1 ? n[0]
    : n.slice(0,-1).join(", ") + " and " + n[n.length-1] + " equally";
  const orderText = Object.keys(bands).map(Number).sort((p,q)=>p-q)
    .map(p => list(bands[p])).join(", then ");

  return `<section>
    <div class="sechead"><h2>About you</h2>
      <span class="note">Your age, when you stop, and how long the plan has to last.</span></div>
    ${assumptionsPanel()}
  </section>

  <section style="margin-top:26px">
    <div class="sechead"><h2>What you hold</h2>
      <span class="note">Each holding compounds at its own rate. Contributions stop at retirement (${ry}) unless you set a year.</span></div>

    <div class="strip">
      <div class="grp"><span>Values as of</span>
        <div class="ctl">
          <input type="date" id="asOfDate" value="${normDate(s.a.asOf)}" aria-label="Date these values are from">
          <button class="btn" id="asOfToday" title="Set this to today">Today</button>
          <button class="btn btn-accent" id="snapBtn" title="File these values under ${asOfYear(s)} in History">Record as ${dateShort(normDate(s.a.asOf))}</button>
        </div></div>
      <div class="grp" style="max-width:330px;padding-top:19px">
        <span class="note" style="font-size:12.5px;line-height:1.45">Everything below is what each holding was worth on
        ${asOfLabel(s)}. Edits save themselves as you type; <b>Record</b> is separate &mdash; it files these figures under
        ${asOfYear(s)} in History, stamped with the date in that box. Change the date first to log an older reading.</span></div>
      <div class="sep"></div>
      <div class="grp"><span>Gains exempt each year</span>
        <input class="money" type="text" inputmode="numeric" id="cgExempt" value="${IN.format(num(s.a.cgExempt))}" style="width:118px">
        </div>
    </div>

    <div class="panel panel-pad" style="margin-bottom:14px;font-size:13px;line-height:1.55;color:var(--ink-2)">
      <b style="color:var(--ink)">Withdraw order</b> decides where a goal's money comes from: <b>1</b> is sold first,
      then 2, then 3, and holdings sharing a number give equal amounts until one runs dry. A holding locked till a later
      year is skipped until then. As it stands: <b style="color:var(--ink)">${esc(orderText || "nothing included")}</b>.
      <br>
      <b style="color:var(--ink)">Tax category</b> says when the gain is taxed.
      <b>Every year</b> &mdash; bank interest, rent &mdash; pays as it accrues, so that tax never compounds, and nothing
      more is due when the money comes out. <b>On withdrawal</b> &mdash; equity, debt funds, NPS &mdash; pays nothing
      until you sell: a withdrawal takes principal and gain in the same proportion as the holding, and only the gain
      slice is taxed. That deferral is worth real money, which is why the two cannot share one rate.
      <b>Put in so far</b> is the principal; the rest of the value is gain. Withdrawals are grossed up, so a goal needing
      ${short(1000000)} pulls more than ${short(1000000)} out of the corpus. Set the rate to <b>0</b> for anything exempt,
      like EPF and PPF. The yearly exemption applies to withdrawal gains only.
      ${embedded > 0 ? `Right now ${short(embedded)} of the corpus is tax owed on gains you have not realised yet.` : ""}
      <span style="color:var(--muted)">Default rates follow Indian rules for FY 2025-26 and are a starting point, not tax advice.</span>
    </div>

    <div class="panel"><div class="tblwrap"><table>
      <thead><tr><th></th><th>Holding</th><th>Type</th><th>Owner</th>
        <th class="r">Value now</th><th class="r">Put in so far</th>
        <th class="r">Added / yr</th><th class="r">Step-up %</th><th class="r">Return %</th>
        <th>Tax category</th><th class="r">Tax %</th><th class="r">Withdraw order</th>
        <th class="r">Invest till</th><th class="r">Locked till</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="15" class="empty">No holdings yet.</td></tr>`}</tbody>
      <tfoot><tr><td></td><td>Total</td><td></td><td></td>
        <td class="mono r" data-live="ivTotal">${inr(tv)}</td>
        <td class="mono r" data-live="ivCost">${inr(tc)}</td>
        <td class="mono r" data-live="ivAdd">${inr(ta)}</td>
        <td colspan="7" class="mono r" data-live="ivRet">blended ${pct(MODEL.proj.m.blendedReturn,2)}</td></tr></tfoot>
    </table></div></div>
    <div class="rowactions"><button class="btn btn-accent" data-add="inv">+ Add holding</button>
      <span class="note" style="color:var(--muted);font-size:12.5px">&ldquo;Locked till&rdquo; keeps money like EPF out of reach until the year you set.</span></div>
  </section>`;
}

function goalsTab(){
  const rows = state.goals.map(g => {
    const one = g.kind === "onetime";
    return `<tr data-id="${g.id}">
      <td><input type="checkbox" data-gl="on" ${g.on?"checked":""} aria-label="include"></td>
      <td><input class="w-name" type="text" data-gl="name" value="${esc(g.name)}"${g.isRet?' ':''}></td>
      <td><div class="seg">
        <button data-kind="onetime" aria-pressed="${one}"${g.isRet?" disabled":""}>One-time</button>
        <button data-kind="recurring" aria-pressed="${!one}"${g.isRet?" disabled":""}>Every year</button>
      </div></td>
      <td><input class="w-yr" type="number" data-gl="start" value="${g.start}"${g.isRet?" disabled":""}></td>
      <td>${one ? `<span style="color:var(--muted)">—</span>` : `<input class="w-yr" type="number" data-gl="end" value="${g.end}"${g.isRet?" disabled":""}>`}</td>
      <td><input class="w-num money" type="text" inputmode="numeric" data-gl="amt" value="${IN.format(g.amt)}"></td>
      <td><input class="w-yr" type="number" data-gl="infl" value="${(num(g.infl)*100).toFixed(1)}" step="0.5"></td>
      <td style="text-align:center"><input type="checkbox" data-gl="ess" ${g.ess?"checked":""} aria-label="essential"></td>
      <td>${g.isRet ? `<span class="pillsm">auto</span>` : `<button class="icon-btn" data-del="goal" aria-label="Remove ${esc(g.name)}">✕</button>`}</td>
    </tr>`;
  }).join("");
  return `<section>
    <div class="sechead"><h2>Goals</h2>
      <span class="note">Amounts are in today&rsquo;s rupees; each goal inflates at its own rate. Recurring goals repeat every year between the two years.</span></div>
    <div class="panel"><div class="tblwrap"><table>
      <thead><tr><th></th><th>Goal</th><th>Type</th><th class="r">From</th><th class="r">To</th>
        <th class="r">Cost today</th><th class="r">Inflation %</th><th style="text-align:center">Must-have</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="9" class="empty">No goals yet.</td></tr>`}</tbody>
    </table></div></div>
    <div class="rowactions">
      <button class="btn btn-accent" data-add="goal">+ Add one-time goal</button>
      <button class="btn" data-add="goalrec">+ Add recurring goal</button>
      <span class="note" style="color:var(--muted);font-size:12.5px">Must-have goals are paid first when there isn&rsquo;t enough to go round.</span>
    </div>
    <div class="callout" style="margin-top:16px">Retirement spending is just a recurring goal &mdash; it starts the year you retire and runs to the end of the plan, so it competes for the same corpus as everything else. Its years follow the retirement age on the dashboard.</div>
  </section>`;
}

function histReadout(){
  const t = MODEL.trk;
  if (!t.enough && t.sketch){
    const e = state.history.find(h => h.estimated);
    return `<div class="callout estcallout" style="margin-bottom:18px"><b>Only one year is recorded, so there is nothing to compare yet.</b>
      ${e ? `${e.year} on the chart is an estimate, worked back from ${e.year + 1} using the plan's own ${pct(t.assumed,2)} return. Because it comes from the plan, it sits exactly on the plan by construction and says nothing about whether you are ahead or behind &mdash; it is there only to give the chart a slope.
      Type the real ${e.year} year-end value in the table below and the comparison becomes worth reading.` : ""}</div>`;
  }
  if (!t.enough){
    return `<div class="callout" style="margin-bottom:18px"><b>Add at least two years to see whether you are on track.</b>
      Record what the portfolio was actually worth at the end of each past year, and what you put in during that year.
      The tool then compares reality against what your assumed returns would have produced, and tells you the return you actually earned.</div>`;
  }
  const ahead = t.gap >= 0;
  return `<div class="tiles" style="margin-bottom:18px">
    <div class="tile"><div class="k">Return you actually earned</div>
      <div class="v ${ahead?"good":"bad"}">${pct(t.implied,2)}</div>
      <div class="m">over ${t.span} year${t.span>1?"s":""} of records</div></div>
    <div class="tile"><div class="k">Return the plan assumes</div><div class="v">${pct(t.assumed,2)}</div>
      <div class="m">weighted across your holdings</div></div>
    <div class="tile"><div class="k">${ahead?"Ahead of plan":"Behind plan"}</div>
      <div class="v ${ahead?"good":"bad"}">${(ahead?"+":"")+short(t.gap)}</div>
      <div class="m">${(ahead?"+":"")+pct(t.gapPct)} against where the plan says you'd be</div></div>
  </div>`;
}

function historyTab(){
  const t = MODEL.trk, liveY = asOfYear(state);
  const fmtGap = g => g == null ? "&mdash;" : (g >= 0 ? "+" : "") + short(g);

  const rows = state.history.slice().sort((a,b)=>num(a.year)-num(b.year)).map(h => {
    const r = t.rows.find(x => x.id === h.id) || {};
    const live = num(h.year) === liveY;
    const derivedC = h.snaps && h.snaps.length > 0;
    const gap = t.enough ? r.gap : null;

    const est = !!h.estimated;
    const yearCell = live
      ? `<td class="mono"><b>${h.year}</b> <span class="inprog">in progress</span></td>`
      : est
      ? `<td class="mono"><b>${h.year}</b> <span class="pillsm est">estimated</span></td>`
      : `<td><input class="w-yr" type="number" data-hs="year" value="${h.year}"></td>`;
    /* the running year is the holdings total, so it is shown, not typed */
    const actualCell = live
      ? `<td class="mono r derivedcell"><b>${inr(num(h.actual))}</b></td>`
      : `<td><input class="w-num money" type="text" inputmode="numeric" data-hs="actual" value="${IN.format(h.actual)}"></td>`;
    const contribCell = est
      ? `<td class="mono r derivedcell" title="The plan's annual investing, taken back a year">${inr(num(h.contribution))}</td>`
      : derivedC
      ? `<td class="mono r derivedcell" title="Added up from the snapshots below">${inr(num(h.contribution))}</td>`
      : `<td><input class="w-num money" type="text" inputmode="numeric" data-hs="contribution" value="${IN.format(h.contribution)}"></td>`;

    const main = `<tr data-id="${h.id}"${live?' class="live"':est?' class="estrow"':''}>
      ${yearCell}${actualCell}${contribCell}
      <td class="mono r" style="color:var(--muted)" data-planned="${h.id}">${r.planned != null ? short(r.planned) : "&mdash;"}</td>
      <td class="mono r" data-gap="${h.id}" style="color:${gap==null?"var(--muted)":(gap>=0?"var(--good)":"var(--critical)")}">${fmtGap(gap)}</td>
      <td>${est
        ? `<span class="estnote">${esc(h.note||"")} Type the real year-end value to replace it.</span>`
        : `<input type="text" data-hs="note" value="${esc(h.note||"")}" placeholder="${live?"still running":"what changed"}">`}</td>
      <td>${live?"":`<button class="icon-btn" data-del="hist" aria-label="Remove year ${h.year}">&#10005;</button>`}</td>
    </tr>`;

    const snaps = (h.snaps||[]).map((sn, k) => {
      const prev = k > 0 ? num(h.snaps[k-1].total) : null;
      const move = prev == null ? null : num(sn.total) - prev;
      return `<tr class="snap" data-hid="${h.id}" data-sid="${sn.id}">
        <td><div class="when"><span class="rail"></span>
          <input type="date" data-sn="date" value="${sn.date}" aria-label="Date of this reading"></div></td>
        <td class="mono r">${inr(num(sn.total))}</td>
        <td><input class="w-num money" type="text" inputmode="numeric" data-sn="added" value="${IN.format(num(sn.added))}" aria-label="Added since the previous reading"></td>
        <td class="mono r" style="color:var(--muted)">${move == null ? "&mdash;" : (move>=0?"+":"") + short(move)}</td>
        <td class="mono r" style="color:var(--muted)">${move == null ? "" : "since last"}</td>
        <td><input type="text" data-sn="note" value="${esc(sn.note||"")}" placeholder="what changed"></td>
        <td><button class="icon-btn" data-del="snap" aria-label="Remove the reading from ${dateShort(sn.date)}">&#10005;</button></td>
      </tr>`;
    }).join("");

    return main + snaps;
  }).join("");

  const chart = histChart();
  return `<section>
    <div class="sechead"><h2>Where you have actually got to</h2>
      <span class="note">The projection starts from today. This is the record behind it.</span></div>
    <div id="histReadout">${histReadout()}</div>
    <div class="panel panel-pad" style="margin-bottom:18px">
      <div class="legend"><span><i class="ln" style="background:var(--s1)"></i>What the portfolio was actually worth</span>
        <span><i class="ln" style="background:var(--muted)"></i>What the assumed return would have produced</span></div>
      <div class="chartbox" id="histChartBox">${chart || ""}</div></div>
    <div class="panel"><div class="tblwrap"><table>
      <thead><tr><th class="r">Year</th><th class="r">Corpus at year end</th><th class="r">Invested during the year</th>
        <th class="r">Plan would say<span class="infoicon" title="Your corpus if every past year had earned the plan's assumed return, given what you actually invested">ⓘ</span></th><th class="r">Difference<span class="infoicon" title="Actual corpus at year end minus &quot;Plan would say&quot;. Green = ahead of plan, red = behind plan">ⓘ</span></th><th>Note</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty">No records yet.</td></tr>`}</tbody>
    </table></div></div>
    <div class="rowactions"><button class="btn btn-accent" data-add="hist">+ Add an earlier year</button>
      <span class="note" style="color:var(--muted);font-size:12.5px">Indented rows are the readings you recorded during a
      year. ${liveY} is still running: its corpus follows the Portfolio tab, and it joins the comparison once the year ends.</span></div>
  </section>`;
}

function yearsTab(){
  const ys = MODEL.proj.years;
  const rqAll = reqEndFor(ys, reqCurve);
  /* label holdings the way the withdraw-order sentence does: bare name, with
     the owner appended only when two holdings share a name */
  const seen = {};
  state.investments.filter(i => i.on).forEach(i => seen[i.name] = (seen[i.name] || 0) + 1);
  const holdLabel = i => (seen[i.name] > 1 && i.owner) ? i.name + " (" + i.owner + ")" : i.name;
  /* Every holding that either gave money or paid tax this year. A holding
     taxed as it accrues pays on its growth even in a year nothing is taken
     out of it, so listing withdrawals alone would leave part of the Tax
     column unexplained. */
  const drawnFrom = y => state.investments
    .filter(i => {
      const b = i.on && y.byInv[i.id]; if (!b) return false;
      return b.withdrawal > 1 || (num(b.taxYear) + num(b.taxDraw)) > 1;
    })
    .map(i => {
      const b = y.byInv[i.id];
      return {name: holdLabel(i), amt: num(b.withdrawal), tax: num(b.taxYear) + num(b.taxDraw)};
    })
    .sort((a,b) => (b.amt - a.amt) || (b.tax - a.tax));
  const rows = ys.map((y, yi) => {
    const rq = rqAll ? rqAll[yi] : null;
    const notes = y.goals.map(g => g.short > 1
      ? `<span style="color:var(--critical)">${esc(g.name)} short ${short(g.short)}</span>`
      : esc(g.name)).join(", ");
    return `<tr class="${y.phase==="Retirement"?"retired":""}">
      <td class="mono">${y.year}</td><td class="mono">${y.age}</td>
      <td>${y.phase==="Retirement"?'<span class="pillsm">retired</span>':""}</td>
      <td class="mono r">${short(y.opening)}</td>
      <td class="mono r" style="color:${y.contribution?"var(--s1)":"var(--muted)"}">${y.contribution?short(y.contribution):"—"}</td>
      <td class="mono r" style="color:var(--s2)">${short(y.growth)}</td>
      <td class="mono r" style="color:${y.goalSpend?"var(--s3)":"var(--muted)"}">${y.goalSpend?short(y.goalSpend):"—"}</td>
      <td class="mono r" style="color:${y.retSpend?"var(--s4)":"var(--muted)"}">${y.retSpend?short(y.retSpend):"—"}</td>
      <td class="mono r" style="color:${y.tax?"var(--s5)":"var(--muted)"}">${y.tax?short(y.tax):"—"}</td>
      <td class="mono r"><b>${short(y.closing)}</b></td>
      ${rq == null ? `<td class="mono r" style="color:var(--muted)">&mdash;</td>`
        : `<td class="mono r" style="color:${y.closing-rq>=0?"var(--good)":"var(--critical)"}">${(y.closing-rq>=0?"+":"")+short(y.closing-rq)}</td>`}
      <td style="font-size:12px;color:var(--ink-2);min-width:190px">${(() => {
        const d = drawnFrom(y);
        return d.length ? d.map(x => `<span class="drawn"><b>${esc(x.name)}</b>${
            x.amt > 1 ? " " + short(x.amt) : ""}${
            x.tax > 1 ? `<em>${x.amt > 1 ? "tax " : "tax only "}${short(x.tax)}</em>` : ""}</span>`).join("")
          : `<span style="color:var(--muted)">&mdash;</span>`;
      })()}</td>
      <td style="font-size:12px;color:var(--ink-2)">${notes||""}</td>
    </tr>`;
  }).join("");
  return `<section>
    <div class="sechead"><h2>Year by year</h2>
      <span class="note">Every rupee in and out, from now to age ${state.a.lifeExpectancy}. &ldquo;Drawn from&rdquo; is the gross taken out of each holding, and the tax each one paid &mdash; a holding taxed every year pays on its growth even when nothing is withdrawn from it.</span>
      <span class="spacer"></span>
      <button class="btn" id="csvBtn">Download as CSV</button></div>
    <div class="panel"><div class="tblwrap"><table>
      <thead><tr><th class="r">Year</th><th class="r">Age</th><th></th><th class="r">Opening</th><th class="r">Invested</th>
        <th class="r">Growth</th><th class="r">Goals</th><th class="r">Living costs</th><th class="r">Tax</th><th class="r">Closing</th><th class="r">Surplus / short</th><th>Drawn from, and tax</th><th>What happens</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
  </section>`;
}

function dashTab(){
  return `
    <section>${banner()}</section>
    <!-- The premises come before the numbers they produce: the verdict says
         what the answer is, this says what it was worked out from, and
         everything below follows. -->
    <section>
      <div class="sechead"><h2>What this rests on</h2>
        <span class="note">Every figure below is worked out from these. Change any of them on the Portfolio tab.</span></div>
      <div id="asmpBox">${assumptionsSummary()}</div>
    </section>
    <section>${tiles()}</section>
    <section>
      <div class="sechead"><h2>The corpus over time</h2>
        <span class="note">Recorded history to ${state.a.currentYear}, projected after.</span></div>
      <div class="panel panel-pad">
        <div class="legend">
          <span><i class="ln" style="background:var(--c-rec)"></i>Actually recorded</span>
          <span><i class="ln" style="background:var(--c-proj)"></i>Projected</span>
          <span><i class="ln" style="background:var(--c-need)"></i>Needed to fund every goal</span>
          <span><i class="ln" style="background:var(--c-ret)"></i>Retirement</span>
          <span><i class="ln" style="background:var(--c-goal)"></i>One-time goals</span>
        </div>
        <div class="chartbox" id="corpusBox"></div>
      </div>
    </section>
    <section>
      <div class="sechead"><h2>Are you investing enough?</h2>
        <span class="note">Each card is the point at which one lever, on its own, exactly funds every goal to age ${state.a.lifeExpectancy}. Green is slack; red is a gap.</span></div>
      ${fixes()}
    </section>
    <section>
      <div class="sechead"><h2>Are the goals funded?</h2>
        <span class="note">Costs are inflated to the year they fall due.</span></div>
      ${goalTable()}
    </section>
    <section>
      <div class="sechead"><h2>Money in, money out</h2>
        <span class="note">Above the line is what goes in; below is what comes out.</span></div>
      <div class="panel panel-pad">
        <div class="legend">
          <span><i style="background:var(--s1)"></i>Invested</span>
          <span><i style="background:var(--s2)"></i>Growth</span>
          <span><i style="background:var(--s3)"></i>Goal spending</span>
          <span><i style="background:var(--s4)"></i>Living costs in retirement</span><span><i style="background:var(--s5)"></i>Tax</span>
          <span><i class="unf"></i>Needed but not paid</span>
        </div>
        <div class="chartbox" id="flowBox"></div>
        <div class="legendnote">Exact figures for every year are on the <b>Year by year</b> tab.</div>
      </div>
    </section>
`;
}
