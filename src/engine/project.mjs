/* Ported verbatim from the v37 planner page (_archive/v37_reference). The ONLY place maths lives.
   Do not edit without re-running tests/parity_html.mjs. */
import { num } from "../schema/util.mjs";
import { A, byWithdrawOrder } from "../schema/plan.mjs";

/* Growth uses the mid-year convention:
   growth = (opening + contribution/2) * return                              */
export function project(s){
  const a = s.a, ry = A.retYear(s), ey = A.endYear(s);
  /* withdraw-priority order, ties by id: the one deliberate change from v37 */
  const inv = s.investments.filter(i => i.on).sort(byWithdrawOrder);
  const goals = s.goals.filter(g => g.on);
  const byId = {}; inv.forEach(i => byId[i.id] = i);

  const bal = {}, basis = {};
  inv.forEach(i => { bal[i.id] = num(i.val); basis[i.id] = num(i.cost, num(i.val)); });

  const paid = {}, due = {}, firstShort = {};
  goals.forEach(g => { paid[g.id]=0; due[g.id]=0; firstShort[g.id]=null; });

  const years = []; let depletion = null, totalTax = 0;

  for (let y = a.currentYear; y <= ey; y++){
    const phase = y < ry ? "Accumulation" : "Retirement";
    const opening = inv.reduce((t,i) => t + bal[i.id], 0);

    const contrib = {};
    inv.forEach(i => {
      const stop = (i.until == null) ? ry - 1 : i.until;
      contrib[i.id] = (y <= stop && i.add) ? num(i.add) * Math.pow(1 + num(i.step), y - a.currentYear) : 0;
    });
    const contribTotal = inv.reduce((t,i) => t + contrib[i.id], 0);

    /* Growth is reported gross. A holding taxed as it accrues settles up the
       same year, so its tax never compounds — and what survives has already
       been taxed, which is why it joins the cost base below. */
    const grow = {}, yearTax = {};
    inv.forEach(i => {
      let r = num(i.ret);
      if (a.usePostRet && y >= ry) r = num(a.postRetReturn);
      const g = (bal[i.id] + contrib[i.id]/2) * r;
      grow[i.id] = g;
      yearTax[i.id] = (i.taxWhen === "tax_at_year_end" && g > 0) ? g * num(i.taxRate) : 0;
    });
    const growthTotal = inv.reduce((t,i) => t + grow[i.id], 0);
    const accrualTax = inv.reduce((t,i) => t + yearTax[i.id], 0);

    const pre = {}, preBasis = {};
    inv.forEach(i => {
      pre[i.id] = bal[i.id] + contrib[i.id] + grow[i.id] - yearTax[i.id];
      preBasis[i.id] = basis[i.id] + contrib[i.id]
        + (i.taxWhen === "tax_at_year_end" ? grow[i.id] - yearTax[i.id] : 0);
    });

    /* Every withdrawal takes principal and gain in the same proportion as the
       holding, so the gain fraction survives the draw untouched and can be
       fixed once a year — only that fraction of what comes out is taxed. */
    const gainFrac = {};
    inv.forEach(i => gainFrac[i.id] = pre[i.id] > 0
      ? Math.max(0, pre[i.id] - preBasis[i.id]) / pre[i.id] : 0);

    const openIds = inv.filter(i => i.avail == null || y >= i.avail).map(i => i.id);
    const wd = {}, wdTaxPer = {}; inv.forEach(i => { wd[i.id] = 0; wdTaxPer[i.id] = 0; });
    const yearGoals = []; let shortfall = 0, wdTax = 0;
    let exemptLeft = num(a.cgExempt);

    /* Draw order: the lowest number goes first. Holdings sharing a number give
       equal rupee amounts — not amounts proportional to their size — and when
       one runs dry the others in that band cover what it could not. Locked
       holdings are simply absent from openIds until their year arrives. */
    const tiers = [];
    const byPri = {};
    openIds.forEach(id => { const p = num(byId[id].pri, 50); (byPri[p] = byPri[p] || []).push(id); });
    Object.keys(byPri).map(Number).sort((p,q) => p - q).forEach(p => tiers.push(byPri[p]));

    function split(G){
      const per = {}; openIds.forEach(id => per[id] = 0);
      if (G <= 0) return per;
      let left = G;
      for (const tier of tiers){
        if (left <= 1e-9) break;
        let pool = tier.filter(id => (pre[id] - wd[id]) > 1e-9);
        while (pool.length && left > 1e-9){
          const share = left / pool.length;
          let used = 0; const next = [];
          for (const id of pool){
            const avail = pre[id] - wd[id] - per[id];
            const take = Math.min(share, avail);
            per[id] += take; used += take;
            if (avail - take > 1e-9) next.push(id);
          }
          left -= used;
          if (used <= 1e-12) break;          // nothing left to give in this band
          pool = next;
        }
      }
      return per;
    }

    /* On the way out, only holdings in the withdrawal category owe anything —
       the year-end ones have already paid. A rate of 0 means exempt. */
    function drawTax(id, gross, exLeft){
      const i = byId[id];
      if (gross <= 0 || i.taxWhen !== "tax_on_withdrawal") return {tax:0, ex:0};
      const rate = num(i.taxRate);
      if (rate <= 0) return {tax:0, ex:0};
      const gain = gross * gainFrac[id];
      const ex = Math.min(gain, Math.max(exLeft, 0));
      return {tax: Math.max(0, gain - ex) * rate, ex};
    }

    function netOf(G){
      const per = split(G), taxPer = {};
      let tax = 0, ex = exemptLeft, gross = 0;
      for (const id of openIds){
        if (per[id] <= 0) continue;
        const r = drawTax(id, per[id], ex);
        taxPer[id] = r.tax;
        tax += r.tax; ex -= r.ex; gross += per[id];
      }
      return {per, taxPer, tax, gross, net: gross - tax, exLeft: ex};
    }

    const demands = [];
    goals.forEach(g => {
      if (y < g.start || y > g.end) return;
      const amt = num(g.amt) * Math.pow(1 + num(g.infl), y - a.currentYear);
      if (amt > 0){ demands.push({g, amt}); due[g.id] += amt; }
    });
    demands.sort((x,z) => (x.g.ess === z.g.ess) ? x.g.start - z.g.start : (x.g.ess ? -1 : 1));

    const anyTax = openIds.some(id => byId[id].taxWhen === "tax_on_withdrawal"
      && num(byId[id].taxRate) > 0 && gainFrac[id] > 0);

    demands.forEach(({g, amt}) => {
      let pool = 0; openIds.forEach(id => pool += Math.max(pre[id] - wd[id], 0));
      const cap = netOf(pool);
      let res;
      if (cap.net <= amt + 1e-6){
        res = cap;                                  // everything left, still short
      } else if (!anyTax){
        res = netOf(amt);                           // no tax in the way
      } else {
        /* gross up: find the draw whose after-tax proceeds meet the goal */
        let lo = 0, hi = pool;
        for (let k = 0; k < 34; k++){
          const mid = (lo + hi) / 2;
          if (netOf(mid).net < amt) lo = mid; else hi = mid;
        }
        res = netOf(hi);
      }
      const take = Math.min(res.net, amt);
      const short = Math.max(amt - res.net, 0);
      if (short > 1e-6 && firstShort[g.id] == null) firstShort[g.id] = y;
      shortfall += short; paid[g.id] += take;
      openIds.forEach(id => { wd[id] += res.per[id]; wdTaxPer[id] += (res.taxPer[id] || 0); });
      exemptLeft = res.exLeft;
      wdTax += res.tax;
      yearGoals.push({id:g.id, name:g.name, isRet:!!g.isRet, due:amt, paid:take, short, tax:res.tax});
    });

    const taxThisYear = accrualTax + wdTax;
    totalTax += taxThisYear;

    inv.forEach(i => {
      const w = wd[i.id];
      bal[i.id] = pre[i.id] - w;
      basis[i.id] = Math.max(0, preBasis[i.id] - w * (1 - gainFrac[i.id]));
    });
    const closing = inv.reduce((t,i) => t + bal[i.id], 0);
    const grossOut = inv.reduce((t,i) => t + wd[i.id], 0);
    if (depletion == null && closing <= 1 && grossOut > 0) depletion = y;

    const goalSpend = yearGoals.filter(g => !g.isRet).reduce((t,g) => t + g.paid, 0);
    const retSpend  = yearGoals.filter(g =>  g.isRet).reduce((t,g) => t + g.paid, 0);

    /* what the corpus still owes on gains it has not realised */
    /* only the withdrawal category carries a liability into the future;
       the year-end ones have settled everything they owe */
    const embedded = inv.reduce((t,i) => i.taxWhen === "tax_on_withdrawal"
      ? t + Math.max(0, bal[i.id] - basis[i.id]) * num(i.taxRate) : t, 0);

    years.push({
      year:y, age: a.currentAge + (y - a.currentYear), phase,
      opening, contribution:contribTotal, growth:growthTotal,
      withdrawal:goalSpend + retSpend, tax:taxThisYear,
      outflow: goalSpend + retSpend + taxThisYear,
      goalSpend, retSpend, shortfall, closing, embeddedTax: embedded,
      goals: yearGoals,
      byInv: inv.reduce((o,i) => (o[i.id] = {
        opening: pre[i.id] - contrib[i.id] - grow[i.id] + yearTax[i.id],
        basisOpen: preBasis[i.id] - contrib[i.id]
          - ((i.taxWhen === "tax_at_year_end") ? grow[i.id] - yearTax[i.id] : 0),
        contribution: contrib[i.id], growth: grow[i.id],
        withdrawal: wd[i.id], closing: bal[i.id],
        /* two different taxes, kept apart: one charged on this year's growth
           whether or not anything was withdrawn, the other on the gain inside
           what was sold */
        taxYear: yearTax[i.id], taxDraw: wdTaxPer[i.id] || 0
      }, o), {})
    });
  }

  const goalStatus = goals.map(g => {
    const d = due[g.id], p = paid[g.id];
    let st = "Not scheduled";
    if (d > 0) st = (p >= d - 1) ? "Funded" : (p <= 1 ? "Unfunded" : "Partial");
    return {id:g.id, name:g.name, kind:g.kind, start:g.start, end:g.end, isRet:!!g.isRet,
            ess:!!g.ess, due:d, paid:p, short:Math.max(d-p,0), status:st, firstShort:firstShort[g.id]};
  });

  const byYear = {}; years.forEach(y => byYear[y.year] = y);
  const atRet = byYear[ry] ? byYear[ry].opening : (years[0] ? years[0].opening : 0);
  const disc = num(a.postRetReturn);
  let required = 0;
  years.forEach(y => {
    if (y.year < ry) return;
    const d = y.goals.reduce((t,g) => t + g.due, 0);
    required += d / Math.pow(1 + disc, y.year - ry + 0.5);
  });
  let peak = years[0] || null;
  years.forEach(y => { if (!peak || y.closing > peak.closing) peak = y; });
  const totalShort = years.reduce((t,y) => t + y.shortfall, 0);
  const curCorpus = inv.reduce((t,i) => t + num(i.val), 0);
  const embeddedNow = inv.reduce((t,i) => i.taxWhen === "tax_on_withdrawal"
    ? t + Math.max(0, num(i.val) - num(i.cost, num(i.val))) * num(i.taxRate) : t, 0);

  return {
    years, goalStatus,
    m: {
      currentCorpus: curCorpus,
      embeddedTaxNow: embeddedNow,
      afterTaxNow: curCorpus - embeddedNow,
      totalTax,
      annualContribution: inv.reduce((t,i) => t + ((i.until==null || i.until>=a.currentYear) ? num(i.add) : 0), 0),
      blendedReturn: curCorpus ? inv.reduce((t,i) => t + num(i.val)*num(i.ret), 0)/curCorpus : 0,
      retirementYear: ry, endYear: ey,
      corpusAtRetirement: atRet, requiredAtRetirement: required,
      surplus: atRet - required,
      finalCorpus: years.length ? years[years.length-1].closing : 0,
      peakCorpus: peak ? peak.closing : 0, peakYear: peak ? peak.year : null,
      depletionYear: depletion, totalShortfall: totalShort,
      allFunded: goalStatus.every(g => g.status === "Funded" || g.status === "Not scheduled"),
      totalGoalSpend: goalStatus.reduce((t,g) => t + g.due, 0),
      depletionAge: depletion == null ? null : a.currentAge + (depletion - a.currentYear)
    }
  };
}
