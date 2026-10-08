# Financial Goal Planner

A single-page, browser-based planner for long-horizon financial goals: holdings,
goals, a year-by-year projection with tax and withdrawal order, and a history of
how your actual corpus compares with the plan.

**Live app: https://rahul-fiske.github.io/financial-goal-planner/**

## Your data stays with you

- There is no server and no account. The page keeps nothing between sessions: no
  cookies, no `localStorage`, no IndexedDB (the build fails if any appear).
- **Load plan…** reads a `goal_plan.json` inside your browser; **Save plan…** writes it
  back to your own disk. Close the tab and nothing is left behind.
- Your plan file is yours to keep private. This repository ignores `goal_plan.json`
  and `backups/` so a personal plan cannot be committed by accident.
- The page loads its fonts (IBM Plex) from Google Fonts; nothing about your plan is sent.

## Using it

1. Open the live app (or `index.html` from disk in Chrome or Edge).
2. Choose **Start with a sample plan** (a made-up household) to explore, or
   **Load plan…** to open your own `goal_plan.json`.
3. Edit holdings, goals and history. The projection updates as you type.
4. **Save plan…** asks for a folder, writes `goal_plan.json` there and keeps the copy it
   replaces in `backups/` beside it (newest 10 kept). Browsers without the File System
   Access API (Safari, Firefox) download the file instead.

A ready-made example lives in [`samples/sample_plan.json`](samples/sample_plan.json), and
[`samples/Goal_Planner_sample.xlsx`](samples/Goal_Planner_sample.xlsx) is the same model as
live Excel formulas (edit the yellow cells and everything recalculates).

## For developers

Requires Node 18+ (Python 3 and LibreOffice only for the optional spreadsheet).

```
npm test        # engine unit tests
npm run build   # src/ -> index.html (the single file GitHub Pages serves)
npm run sample  # regenerate samples/sample_plan.json
npm run xlsx    # regenerate the sample workbook
```

`index.html` is a build output and is committed so Pages needs no CI. Edit `src/`, run
`npm run build`, and commit both. Design notes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Disclaimer

This is a planning aid, not financial, tax or legal advice. Tax defaults reflect
Indian rules for FY 2025-26, are editable per holding, and may be out of date.

## Maintainer

Maintained by Rahul Fiske (<339444951+rahul-fiske@users.noreply.github.com>). Issues and pull requests are welcome.

## License

[MIT](LICENSE) © 2026 Rahul Fiske
