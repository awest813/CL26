# College Lacrosse Head Coach Sim — Agent Instructions

## Product goal
Build a deterministic, web-based college lacrosse head coach simulation with:
- 128 teams (16 conferences x 8 teams)
- 12-game regular season (7 conference round robin + 5 non-conference)
- Weekly Top 25 + Top 12 playoff projection
- 12-team playoff bracket (1–4 byes; R1 = 5v12, 6v11, 7v10, 8v9)
- NCAA-ish realism with fully fictionalized branding

## Architecture rules
1. Keep simulation logic pure and isolated under `src/sim/`.
   - No React/Redux imports in simulation modules.
   - Planned core files: `rng.ts`, `matchEngine.ts`, `schedule.ts`, `rankings.ts`.
2. Redux slices live in `src/features/`.
   - `leagueSlice`: static league/team data loaded from JSON at startup; **do not persist**.
   - `seasonSlice`: schedule/results/standings/current week/playoffs; **persist**.
   - `coachSlice`: selected user team, tactics, settings; **persist**.
   - `uiSlice`: optional minimal UI state.
3. Persistence configuration must whitelist only persisted gameplay/user slices.
4. Prefer derived views + memoized selectors for standings/rankings over storing redundant state.

## Current phase focus
For this phase, scaffold architecture and implement league browsing + generated roster summaries.
Do **not** implement full sim engine yet.

## Cursor Cloud specific instructions

This is a client-side-only React SPA — no backend, database, or Docker services are needed.

### Quick reference

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (Vite, default `http://localhost:5173`) |
| Lint | `npm run lint` |
| Build (type-check + prod) | `npm run build` |
| Unit/regression tests | `npm run test:regression` (requires `bun` on PATH) |

### Non-obvious notes

- **Bun is required for tests.** The `test:regression` script uses `bun test`. Bun is pre-installed at `~/.bun/bin/bun`; ensure `~/.bun/bin` is on `PATH`.
- **No `.env` or secrets needed.** All game data comes from bundled JSON files (`src/data/teams128.json`, `src/data/names.json`) and browser `localStorage` via `redux-persist`.
- **ESLint config is CJS.** The config lives in `.eslintrc.cjs` (CommonJS) despite the project being `"type": "module"`.
- **Test files are excluded from `tsc`.** `tsconfig.json` excludes `src/**/*.test.ts`, so `npm run build` won't type-check test files.
