/* Engine entry point. Pure: no DOM, no storage, no clock except where a
   caller passes one in. */
export { project } from "./project.mjs";
export { track } from "./track.mjs";
export { requiredCurve, reqEndFor } from "./required.mjs";
export { survives, withLump, solveAll } from "./solvers.mjs";
export { ensureEstimate, estimateNote } from "../schema/history.mjs";
export { holdLabeller, drawnFrom, yearRows, toCsv, CSV_HEADER } from "./attribution.mjs";

import { normalize } from "../schema/plan.mjs";
import { project } from "./project.mjs";
import { track } from "./track.mjs";
import { solveAll } from "./solvers.mjs";

/* What the page's recompute() produced, minus the deferred required curve. */
export function model(state){
  normalize(state);
  const proj = project(state);
  return {proj, trk: track(state), fix: solveAll(state)};
}
