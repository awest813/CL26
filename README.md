# College Lacrosse Head Coach Sim

A deterministic, web-based college lacrosse head-coaching simulation. Build a program, recruit players, call the shots week by week, and chase a championship — all in the browser with no backend required.

- **128 fictionalized teams** across 16 conferences
- **12-game regular season** (7 conference round-robin + 5 non-conference)
- **Full postseason** — weekly Top 25 + Top 12 bracket projection, 12-team playoff with automatic byes for seeds 1–4
- **Coach career layer** — onboarding, program selection, recruiting board with CPU recruiting battles, staff-run recruiting, transfer portal, pro draft, assistants, coach skill tree, job market, weekly hub with sim to the bracket, offseason roster turnover
- **Event-driven match engine calibrated to 2026 NCAA D-I team stats** — goals, shooting and save percentage, turnovers, ground balls, faceoffs, clears, man-up, and stat leaders land near real D-I (see [docs/SIM_AUDIT.md](./docs/SIM_AUDIT.md))
- **Game plans with counters** — tempo, ride/clear, slide timing, offense set, defense package, and midfield lines; every call wins some matchups and loses others, CPU staffs scout and adjust, and no scheme beats the default against every opponent
- **Position-aware ratings** — a player's overall weighs what his position does (a goalie's saves, a faceoff man's draws, a defenseman's defense)
- **Weekly color** — postgame press conferences with small, stated effects, a league news wire, rivalry trophies, and an optional goal-by-goal reveal of your game
- **Make it yours** — rename any program and pick its logo; light, dark, or system theme; comfortable or compact density
- **Accessible** — no axe-core violations on any page in either theme, keyboard navigation with a skip link, and layouts that work from phone to desktop
- **Fully deterministic** — same seed always produces the same schedule, rosters, and results
- **Client-side only** — all state lives in `localStorage` via redux-persist; no server, no account required. Pages load on demand, so the first visit downloads about 415 KB of JavaScript
- **Installable and offline** — a PWA (via `vite-plugin-pwa`): install it from the browser, and after the first visit the whole game, every page included, loads without a connection. A new deploy waits for the player to choose Reload now, and the career is saved first. If the browser stops saving (storage full or blocked), every page says so
- **Backups** — download the career as a file from Settings and restore it in any browser or device; older backups upgrade through the same save migrations

The project site is [https://awest813.github.io/CL26/](https://awest813.github.io/CL26/). It publishes from `master` after GitHub Pages is set to **GitHub Actions**. See [Deploy](#deploy).

See [ROADMAP.md](./ROADMAP.md) for milestone status and what's coming next.
See [docs/SIM_AUDIT.md](./docs/SIM_AUDIT.md) for the match-engine calibration, sim gap list, and gameplan.

## Quick start

```bash
npm install
npm run dev        # Vite dev server → http://localhost:5173
```

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite development server |
| `npm run build` | Type-check + production bundle at `/` |
| `npm run build:pages` | Same bundle for GitHub Pages at `/CL26/` |
| `npm run lint` | ESLint over all TS/TSX files |
| `npm run preview` | Serve the production build locally |
| `npm run test:regression` | Regression tests (requires `bun` on PATH) |
| `npm run sim:careers` | Ten 20-season careers in parallel with integrity checks every season and a determinism replay (requires `bun`; about a minute) |

> **Bun is required for tests.** Bun is pre-installed at `~/.bun/bin/bun`; ensure `~/.bun/bin` is on `PATH` before running `test:regression`.

## Architecture at a glance

```
src/
  sim/        Pure deterministic simulation (no React/Redux imports)
  features/   Redux slices — leagueSlice, seasonSlice, coachSlice, settingsSlice, exhibitionSlice
              (cross-slice career flows in features/coach/careerThunks.ts)
  components/ Shared UI (game plan, depth chart, team logo and editor, game log, ...)
  hooks/      React hooks (goal-by-goal game reveal, season sanity check)
  lib/        UI copy shared across pages (tactic labels, season labels)
  pages/      Route-level UI components
  data/       Static JSON — teams128.json, names.json
  types/      Shared TypeScript domain contracts
  store/      Redux store + redux-persist config
```

**Persistence rules**
- Persisted: `season`, `coach`, `settings`
- Not persisted: `league` (reloaded from JSON on every launch, with the user's team edits from `settings` laid over it), `exhibition` (sandbox state)
- Saves migrate forward (`version` and `createMigrate` in `src/store/store.ts`)

## In-app pages

| Route | Page |
|-------|------|
| `/` | Home / dashboard |
| `/conferences` | Browse all 16 conferences |
| `/team/:id` | Team detail, roster summary, rivalry, and Edit team (name, nickname, logo letters and colors) |
| `/exhibition` | Seeded exhibition game with both sides' game plans |
| `/career/setup` | Create coach + choose program |
| `/career` | Coach Office (job, recruiting class, game plan and install, midfield-lines read-out, staff, offseason market) |
| `/career/week` | Weekly hub (play a week or sim to the bracket, last game and press conference, scouting, recruiting pace, league wire) |
| `/career/recruiting` | Recruiting board (targets, hours, pitches, staff plan) |
| `/career/roster` | Roster and depth chart, redshirts |
| `/season` | Season dashboard |
| `/schedule` | Redirects to `/season` |
| `/season/week/:n` | Week game results |
| `/season/standings` | Conference + overall standings |
| `/season/leaders` | Regular-season stat leaders and national awards |
| `/rankings` | Top 25 + Top 12 projection |
| `/playoffs` | Playoff bracket |
| `/settings` | Confirmations, matchup estimate, game reveal speed, theme, density, team-edit reset, backup and restore, and save reset |
| `/login` | Redirects home |
| `/alpha` | Alpha-stage progress tracker |

## Deploy

GitHub Pages serves this app at `/CL26/`. `npm run build:pages` sets that base, and copies `index.html` to `404.html` so a refreshed route such as `/CL26/career` still loads the app. `.nojekyll` is included so Pages does not drop files.

[`.github/workflows/pages.yml`](./.github/workflows/pages.yml) runs on every push to `master`, and it can also be started by hand. Before the first run, open the repo **Settings → Pages** and set **Source** to **GitHub Actions**. The workflow cannot turn that setting on by itself.

The build also emits `manifest.webmanifest`, `sw.js`, and the app icons (`public/pwa-*.png`, `public/apple-touch-icon.png`). The service worker precaches every built file and is scoped to the base path, so it works at `/` and at `/CL26/`. It is not registered by the dev server; check offline behavior with a production preview.

Local check of the Pages bundle:

```bash
npm run build:pages
VITE_PAGES_BASE=/CL26/ npx vite preview
```

## Dependency notes

`npm audit --omit=dev` reports two moderate React Router advisories that are fixed only in React Router 7 (a breaking upgrade). Neither applies here: the open redirect needs navigation to an attacker-controlled path (this app only navigates to its own routes), and the hydration issue needs server-side rendering (this app is client-only). The 6.x line is kept at its latest patch.
