/* Lifted from the v37 planner page (_archive/v37_reference) on 2026-09-19; edited since. */
/* ================================================================ charts */
const CW = 1000, PAD = {l:66, r:20, t:16, b:34};

function svgEl(w,h,inner){
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img">${inner}</svg>`;
}
function niceTicks(min, max, count){
  const span = (max - min) || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw))));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out = []; let v = Math.ceil(min/step)*step;
  while (v <= max + step*0.01){ out.push(v); v += step; }
  return out;
}

/* ---- corpus trajectory: recorded history, then projection --------------- */
function corpusChart(){
  const {years, m} = MODEL.proj, H = 350;
  const hist = state.history.slice().sort((a,b)=>a.year-b.year)
    .filter(r => r.year <= state.a.currentYear);
  const x0 = Math.min(hist.length ? hist[0].year : state.a.currentYear, state.a.currentYear);
  const x1 = m.endYear;
  const pts = years.map(y => ({year:y.year, v:y.closing}));
  const req = reqEndFor(years, reqCurve);
  const all = pts.map(p=>p.v).concat(hist.map(r=>num(r.actual))).concat([0])
    .concat(req ? req.filter(v => v != null) : []);
  const vmax = Math.max.apply(null, all), vmin = Math.min(0, Math.min.apply(null, all));
  const ticks = niceTicks(vmin, vmax, 5);
  const top = Math.max(vmax, ticks[ticks.length-1]);

  const X = yr => PAD.l + (yr - x0) / Math.max(x1 - x0, 1) * (CW - PAD.l - PAD.r);
  const Y = v  => PAD.t + (1 - (v - vmin) / Math.max(top - vmin, 1)) * (H - PAD.t - PAD.b);

  /* The band between what is projected and what is needed, clipped twice:
     green where the projection sits above the requirement, red where below.
     Clipping at the requirement line makes the crossings exact. */
  /* Drawn per unbroken run of years: a year the search could not price (it
     returns null) breaks the line there instead of hiding all of it. */
  let band = "";
  if (req){
    const runs = []; let cur = [];
    years.forEach((y,i) => { if (req[i] != null) cur.push(i); else { if (cur.length) runs.push(cur); cur = []; } });
    if (cur.length) runs.push(cur);
    const yTop = PAD.t.toFixed(1), yBot = (H - PAD.b).toFixed(1);
    runs.forEach((run, r) => {
      const aPts = run.map(i => `${X(years[i].year).toFixed(1)},${Y(years[i].closing).toFixed(1)}`);
      const rPts = run.map(i => `${X(years[i].year).toFixed(1)},${Y(req[i]).toFixed(1)}`);
      if (run.length > 1){
        const region = `M${aPts.join("L")}L${rPts.slice().reverse().join("L")}Z`;
        const x0p = X(years[run[0]].year).toFixed(1), x1p = X(years[run[run.length-1]].year).toFixed(1);
        band += `<defs>
          <clipPath id="reqAbove${r}"><polygon points="${rPts.join(" ")} ${x1p},${yTop} ${x0p},${yTop}"/></clipPath>
          <clipPath id="reqBelow${r}"><polygon points="${rPts.join(" ")} ${x1p},${yBot} ${x0p},${yBot}"/></clipPath>
        </defs>
        <g clip-path="url(#reqAbove${r})"><path d="${region}" fill="var(--good)" opacity="0.16"/></g>
        <g clip-path="url(#reqBelow${r})"><path d="${region}" fill="var(--critical)" opacity="0.16"/></g>`;
      }
      band += run.length > 1
        ? `<path d="M${rPts.join("L")}" fill="none" stroke="var(--c-need)" stroke-width="2.25" stroke-dasharray="7 5" stroke-linejoin="round"/>`
        : `<circle cx="${rPts[0].split(",")[0]}" cy="${rPts[0].split(",")[1]}" r="3" fill="var(--c-need)"/>`;
    });
  }

  let g = "";
  ticks.forEach(t => {
    g += `<line x1="${PAD.l}" y1="${Y(t).toFixed(1)}" x2="${CW-PAD.r}" y2="${Y(t).toFixed(1)}" stroke="var(--grid)" stroke-width="1"/>`;
    g += `<text x="${PAD.l-9}" y="${(Y(t)+4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${short(t)}</text>`;
  });

  const step = (x1 - x0) > 30 ? 5 : ((x1-x0) > 14 ? 2 : 1);
  for (let yr = Math.ceil(x0/step)*step; yr <= x1; yr += step){
    g += `<text x="${X(yr).toFixed(1)}" y="${H-13}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${yr}</text>`;
  }

  const area = "M" + pts.map(p => `${X(p.year).toFixed(1)},${Y(p.v).toFixed(1)}`).join("L")
    + `L${X(pts[pts.length-1].year).toFixed(1)},${Y(Math.max(vmin,0)).toFixed(1)}L${X(pts[0].year).toFixed(1)},${Y(Math.max(vmin,0)).toFixed(1)}Z`;
  const line = "M" + pts.map(p => `${X(p.year).toFixed(1)},${Y(p.v).toFixed(1)}`).join("L");

  // Marker labels sit on a backing chip so they stay readable wherever the
  // curve happens to run.
  let marks = "";
  const mark = (yr, color, label) => {
    if (yr < x0 || yr > x1) return "";
    const xx = X(yr), right = yr > (x0 + x1) / 2;
    const w = label.length * 6.2 + 12;
    const bx = right ? xx - 5 - w : xx + 5;
    return `<line x1="${xx.toFixed(1)}" y1="${PAD.t}" x2="${xx.toFixed(1)}" y2="${H-PAD.b}" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 4"/>`
      + `<rect x="${bx.toFixed(1)}" y="${PAD.t+1}" width="${w.toFixed(1)}" height="16" rx="4" fill="var(--surface)" opacity="0.9"/>`
      + `<text x="${(bx+w/2).toFixed(1)}" y="${PAD.t+12.5}" text-anchor="middle" font-size="11" font-weight="600" fill="${color}">${esc(label)}</text>`;
  };
  marks += mark(m.retirementYear, "var(--c-ret)", "Retire · " + m.retirementYear);
  /* the red marker is the first year the goals are not met — not the year the
     corpus hits zero, which a locked holding can push years later */
  const firstShort = years.find(y => y.shortfall > 1);
  if (firstShort) marks += mark(firstShort.year, "var(--critical)", "Runs short · " + firstShort.year);

  // One-time goals: a tick on the baseline, label ABOVE it so it never
  // collides with the year axis; close labels alternate into a second lane.
  let ev = "";
  const evs = state.goals
    .filter(g2 => g2.on && !g2.isRet && g2.kind === "onetime" && g2.start >= x0 && g2.start <= x1)
    .sort((p,q) => p.start - q.start);
  let lastX = -1e9, lane = 0;
  evs.forEach(g2 => {
    const xx = X(g2.start), yy = Y(0);
    lane = (xx - lastX < 116) ? (lane + 1) % 2 : 0;
    lastX = xx;
    const name = g2.name.length > 17 ? g2.name.slice(0,16) + "…" : g2.name;
    const near = CW - PAD.r - 70;
    const anchor = xx < PAD.l + 62 ? "start" : (xx > near ? "end" : "middle");
    ev += `<line x1="${xx.toFixed(1)}" y1="${(yy-6).toFixed(1)}" x2="${xx.toFixed(1)}" y2="${(yy+6).toFixed(1)}" stroke="var(--c-goal)" stroke-width="2.5"/>`;
    ev += `<text x="${xx.toFixed(1)}" y="${(yy - 12 - lane*13).toFixed(1)}" text-anchor="${anchor}" font-size="10.5" fill="var(--c-goal)">${esc(name)}</text>`;
  });

  let histPath = "";
  if (hist.length > 1){
    histPath = `<path d="M${hist.map(r => `${X(r.year).toFixed(1)},${Y(num(r.actual)).toFixed(1)}`).join("L")}" fill="none" stroke="var(--c-rec)" stroke-width="2.75" stroke-linejoin="round"/>`;
    hist.forEach(r => { histPath += `<circle cx="${X(r.year).toFixed(1)}" cy="${Y(num(r.actual)).toFixed(1)}" r="3.5" fill="var(--ink-2)"/>`; });
  }

  const todayX = X(state.a.currentYear).toFixed(1);
  const zeroY = Y(0).toFixed(1);

  const inner = `
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--c-proj)" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="var(--c-proj)" stop-opacity="0.02"/>
    </linearGradient></defs>
    ${g}
    <line x1="${PAD.l}" y1="${zeroY}" x2="${CW-PAD.r}" y2="${zeroY}" stroke="var(--axis)" stroke-width="1.5"/>
    <path d="${area}" fill="url(#cg)"/>
    ${band}
    ${marks}
    <path d="${line}" fill="none" stroke="var(--c-proj)" stroke-width="2.75" stroke-linejoin="round"/>
    ${histPath}
    ${ev}
    <line x1="${todayX}" y1="${PAD.t}" x2="${todayX}" y2="${H-PAD.b}" stroke="var(--ink-2)" stroke-width="1" stroke-dasharray="2 3" opacity="0.55"/>
    <g id="cx" style="opacity:0">
      <line y1="${PAD.t}" y2="${H-PAD.b}" stroke="var(--ink-2)" stroke-width="1"/>
      <circle r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
    </g>
    <rect id="chit" x="${PAD.l}" y="${PAD.t}" width="${CW-PAD.l-PAD.r}" height="${H-PAD.t-PAD.b}" fill="transparent"/>`;

  return {svg: svgEl(CW, H, inner), X, Y, pts, x0, x1, H};
}

/* ---- money in / money out: inflows above the line, outflows below ------- */
function flowChart(){
  const years = MODEL.proj.years, H = 320;
  const up = years.map(y => y.contribution + y.growth);
  /* what should have gone out but could not is drawn too, as an empty dashed
     bar: without it a year with nothing left to pay from looks like a year
     with nothing to pay */
  const dn = years.map(y => y.outflow + (y.shortfall > 1 ? y.shortfall : 0));
  const vmax = Math.max(1, Math.max.apply(null, up));
  const vmin = -Math.max(1, Math.max.apply(null, dn));
  const ticks = niceTicks(vmin, vmax, 6);
  const lo = Math.min(vmin, ticks[0]), hi = Math.max(vmax, ticks[ticks.length-1]);
  const X = i => PAD.l + (i + 0.5) / years.length * (CW - PAD.l - PAD.r);
  const Y = v => PAD.t + (1 - (v - lo) / Math.max(hi - lo, 1)) * (H - PAD.t - PAD.b);
  const bw = Math.max(4, (CW - PAD.l - PAD.r) / years.length - 4);

  let g = "";
  ticks.forEach(t => {
    g += `<line x1="${PAD.l}" y1="${Y(t).toFixed(1)}" x2="${CW-PAD.r}" y2="${Y(t).toFixed(1)}" stroke="var(--grid)" stroke-width="1"/>`;
    // signed ticks: positive above the line is money in, negative below is money out
    g += `<text x="${PAD.l-9}" y="${(Y(t)+4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${t===0?"₹0":short(t)}</text>`;
  });

  // 2px surface gap BETWEEN stacked segments; the segment touching the
  // baseline stays anchored to it.
  let bars = "";
  years.forEach((y,i) => {
    const cx = X(i) - bw/2;
    let acc = 0, first = true;
    [["contribution","var(--s1)"],["growth","var(--s2)"]].forEach(([k,c]) => {
      const v = y[k]; if (v <= 0) return;
      const yTop = Y(acc + v), yBot = Y(acc);
      const gap = first ? 0 : 2;
      const h = Math.max(yBot - yTop - gap, 0.8);
      bars += `<rect x="${cx.toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${c}" rx="2"/>`;
      acc += v; first = false;
    });
    acc = 0; first = true;
    [["goalSpend","var(--s3)"],["retSpend","var(--s4)"],["tax","var(--s5)"]].forEach(([k,c]) => {
      const v = y[k]; if (v <= 0) return;
      const yTop = Y(-acc), yBot = Y(-(acc + v));
      const gap = first ? 0 : 2;
      const h = Math.max(yBot - yTop - gap, 0.8);
      bars += `<rect x="${cx.toFixed(1)}" y="${(yTop + gap).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${c}" rx="2"/>`;
      acc += v; first = false;
    });
    if (y.shortfall > 1){
      const yTop = Y(-acc), yBot = Y(-(acc + y.shortfall));
      const gap = first ? 0 : 2;
      const h = Math.max(yBot - yTop - gap - 1, 0.8);
      bars += `<rect x="${(cx + 0.75).toFixed(1)}" y="${(yTop + gap + 0.5).toFixed(1)}" width="${(bw - 1.5).toFixed(1)}" height="${h.toFixed(1)}" fill="var(--crit-wash)" stroke="var(--critical)" stroke-width="1.25" stroke-dasharray="3 2" rx="2"/>`;
    }
  });

  const step = years.length > 30 ? 5 : 2;
  let xl = "";
  years.forEach((y,i) => {
    if (y.year % step === 0)
      xl += `<text x="${X(i).toFixed(1)}" y="${H-13}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${y.year}</text>`;
  });

  const rx = X(years.findIndex(y => y.year === MODEL.proj.m.retirementYear));
  const retLine = rx > 0 ? `<line x1="${(rx-bw/2-2).toFixed(1)}" y1="${PAD.t}" x2="${(rx-bw/2-2).toFixed(1)}" y2="${H-PAD.b}" stroke="var(--s4)" stroke-width="1.5" stroke-dasharray="4 4"/>` : "";

  const inner = `${g}${retLine}${bars}
    <line x1="${PAD.l}" y1="${Y(0).toFixed(1)}" x2="${CW-PAD.r}" y2="${Y(0).toFixed(1)}" stroke="var(--axis)" stroke-width="1.5"/>
    ${xl}
    <rect id="fhit" x="${PAD.l}" y="${PAD.t}" width="${CW-PAD.l-PAD.r}" height="${H-PAD.t-PAD.b}" fill="transparent"/>`;
  return {svg: svgEl(CW, H, inner), X, years, H};
}

/* ---- history: what actually happened vs what the plan assumed ---------- */
function histChart(){
  const t = MODEL.trk; if (!t.enough && !t.sketch) return null;
  const H = 260, rows = t.rows;
  const vals = rows.map(r => num(r.actual)).concat(rows.filter(r => r.planned != null).map(r => r.planned));
  const vmax = Math.max.apply(null, vals), vmin = Math.min.apply(null, vals);
  const pad = (vmax - vmin) * 0.15 || vmax * 0.1 || 1;
  const lo = Math.max(0, vmin - pad), hi = vmax + pad;
  const ticks = niceTicks(lo, hi, 4);
  const X = i => PAD.l + (rows.length === 1 ? 0.5 : i/(rows.length-1)) * (CW - PAD.l - PAD.r);
  const Y = v => PAD.t + (1 - (v - lo)/Math.max(hi - lo, 1)) * (H - PAD.t - PAD.b);
  let g = "";
  ticks.forEach(v => {
    g += `<line x1="${PAD.l}" y1="${Y(v).toFixed(1)}" x2="${CW-PAD.r}" y2="${Y(v).toFixed(1)}" stroke="var(--grid)"/>`;
    g += `<text x="${PAD.l-9}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${short(v)}</text>`;
  });
  rows.forEach((r,i) => {
    g += `<text x="${X(i).toFixed(1)}" y="${H-13}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${r.year}</text>`;
  });
  const pth = (key, color, dash) => {
    /* an estimated year is not a reading: the solid line joins recorded values only */
    const pts = rows.map((r,i) => ((key === "actual" && !r.estimated) || (key !== "actual" && r.planned != null))
      ? `${X(i).toFixed(1)},${Y(key === "actual" ? num(r.actual) : r.planned).toFixed(1)}` : null).filter(Boolean);
    return pts.length < 2 ? "" :
      `<path d="M${pts.join("L")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"${dash?` stroke-dasharray="${dash}"`:""}/>`;
  };
  let dots = "";
  /* the estimate joins the record with a dashed line and a hollow, dashed ring */
  rows.forEach((r,i) => {
    if (!r.estimated || i + 1 >= rows.length) return;
    dots += `<path d="M${X(i).toFixed(1)},${Y(num(r.actual)).toFixed(1)}L${X(i+1).toFixed(1)},${Y(num(rows[i+1].actual)).toFixed(1)}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-dasharray="3 4"/>`;
  });
  rows.forEach((r,i) => {
    if (r.estimated){
      dots += `<circle cx="${X(i).toFixed(1)}" cy="${Y(num(r.actual)).toFixed(1)}" r="5" fill="var(--surface)" stroke="var(--s1)" stroke-width="2" stroke-dasharray="2.5 2"/>`
        + `<text x="${X(i).toFixed(1)}" y="${(Y(num(r.actual))+20).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="var(--muted)">estimate</text>`;
      return;
    }
    /* the year still running is drawn hollow — it is a reading, not a result */
    dots += r.inProgress
      ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(num(r.actual)).toFixed(1)}" r="4" fill="var(--surface)" stroke="var(--s1)" stroke-width="2.5"/>`
      : `<circle cx="${X(i).toFixed(1)}" cy="${Y(num(r.actual)).toFixed(1)}" r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/>`;
    if (r.planned != null)
      dots += `<circle cx="${X(i).toFixed(1)}" cy="${Y(r.planned).toFixed(1)}" r="3.5" fill="var(--muted)" stroke="var(--surface)" stroke-width="2"/>`;
  });
  const last = rows[rows.length-1];
  const lbl = `<text x="${(X(rows.length-1)-6).toFixed(1)}" y="${(Y(num(last.actual))-12).toFixed(1)}" text-anchor="end" font-size="11.5" font-weight="600" fill="var(--s1)">${short(num(last.actual))}</text>`;
  return svgEl(CW, H, g + pth("planned","var(--muted)","5 4") + pth("actual","var(--s1)") + dots + lbl);
}
