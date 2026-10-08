# Architecture

The planner is a static page built from ES modules in `src/`. `build/build_html.mjs`
concatenates them into one scope inside an IIFE and writes `index.html`. Every step is
asserted: a duplicate top-level name, a leftover import/export, a stray `</script`, or any
browser-storage call fails the build.

## Layout

```
src/schema/util.mjs      num, clone, dates
src/schema/plan.mjs      SCHEMA, defaultState (fictional household), normalize, merge, rollForward
src/schema/file.mjs      goal_plan.json writer (stable key order) and reader, backup names
src/schema/history.mjs   the estimated earlier year used when one year is recorded
src/engine/project.mjs   the projection: the only place the maths lives
src/engine/track.mjs     actual-vs-plan history comparison
src/engine/required.mjs  required-corpus curve
src/engine/solvers.mjs   retire-at / invest / spend / lump-sum solvers
src/engine/attribution.mjs  drawn-from, tax by holding, year rows and CSV
src/storage/files.js     Load / Save / download
src/ui/                  tabs, charts, editors, app shell
src/theme/style.css      design tokens including the validated chart palette
build/                   html builder, sample generator, spreadsheet generator
tests/engine/            hand-calculated engine tests
```

## Model notes

- **Plan file.** The file is the plan. The page holds it in memory and in that file only.
- **Holdings** are kept in withdraw-priority order (ties by id). The engine is order-sensitive
  inside an equal-priority band because the shared capital-gains exemption is consumed in
  order, so ordering is enforced on load, in the file and in the engine.
- **Tax.** Each holding says when its gain is taxed (on withdrawal, or every year) and at what
  rate; a rate of 0 means exempt. Defaults are starting points, editable per holding.
- **Growth** uses a mid-year convention: `growth = (opening + invested/2) x return`.
- **Estimated year.** With exactly one recorded closed year, `ensureEstimate()` adds a hollow,
  dashed earlier year that sits exactly on the planned curve, so it can never invent a gap. It
  is left out of the ahead/behind comparison and disappears when a real figure is typed.
- **Locked holdings.** A holding with a lock-in is held at its projected balance in the
  required-corpus search, and the page reports the first year a goal is not met in full.
- **Save behaviour.** Folder picker (file + rolling backups), else "Save as" picker, else a plain
  download, chosen by what the browser supports. Replacing a file whose content is not the one
  this plan came from asks first.

## The workbook

`build/export_model.mjs` runs a plan through the page's own merge/normalize and engine and
hands `build/build_xlsx.py` the normalised plan, the projection and the values that cannot be
formulas (required-corpus curve, solvers). Python never re-implements the schema. The workbook
uses Excel-2007 functions only: no macros, no iterative calculation, no circular references.

`python3 build/build_xlsx.py <plan.json|sample> <out.xlsx>` generates it; the file committed
under `samples/` is built from the fictional sample plan only.

## Checks

```
npm test        # engine unit tests
npm run build   # structural assertions listed above
```
