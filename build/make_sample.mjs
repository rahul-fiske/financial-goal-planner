#!/usr/bin/env node
/* Writes samples/sample_plan.json from the built-in, entirely fictional household. */
import fs from "node:fs";
import { defaultState } from "../src/schema/plan.mjs";
import { serialiseJson } from "../src/schema/file.mjs";

const s = defaultState();
s.savedAt = "2026-01-01T00:00:00.000Z";
fs.mkdirSync(new URL("../samples/", import.meta.url), {recursive: true});
fs.writeFileSync(new URL("../samples/sample_plan.json", import.meta.url), serialiseJson(s));
console.log("wrote samples/sample_plan.json");
