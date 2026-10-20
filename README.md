# College Lacrosse Head Coach Sim

A deterministic, web-based college lacrosse head-coaching simulation. Build a program, recruit players, call the shots week by week, and chase a championship — all in the browser with no backend required.

- **128 fictionalized teams** across 16 conferences
- **12-game regular season** (7 conference round-robin + 5 non-conference)
- **Full postseason** — weekly Top 25 + Top 12 bracket projection, 12-team playoff with automatic byes for seeds 1–4
- **Coach career layer** — onboarding, program selection, recruiting board with CPU recruiting battles, staff-run recruiting, weekly hub with sim to the bracket, offseason roster turnover
- **Fully deterministic** — same seed always produces the same schedule, rosters, and results
- **Client-side only** — all state lives in `localStorage` via redux-persist; no server, no account required

The project site is [https://awest813.github.io/CL26/](https://awest813.github.io/CL26/). It publishes from `master` after GitHub Pages is set to **GitHub Actions**. See [Deploy](#deploy).

See [ROADMAP.md](./ROADMAP.md) for milestone status and what's coming next.

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

> **Bun is required for tests.** Bun is pre-installed at `~/.bun/bin/bun`; ensure `~/.bun/bin` is on `PATH` before running `test:regression`.

## Architecture at a glance

```
src/
  sim/        Pure deterministic simulation (no React/Redux imports)
  features/   Redux slices — leagueSlice, seasonSlice, coachSlice, exhibitionSlice
  pages/      Route-level UI components
  data/       Static JSON — teams128.json, names.json
  types/      Shared TypeScript domain contracts
  store/      Redux store + redux-persist config
```

**Persistence rules**
- Persisted: `season`, `coach`, `settings`
- Not persisted: `league` (reloaded from JSON on every launch), `exhibition` (sandbox state)

## In-app pages

| Route | Page |
|-------|------|
| `/` | Home / dashboard |
| `/conferences` | Browse all 16 conferences |
| `/team/:id` | Team detail + roster summary |
| `/exhibition` | Seeded exhibition game |
| `/career/setup` | Create coach + choose program |
| `/career` | Coach Office (job, recruiting class, base scheme and install, staff) |
| `/career/week` | Weekly hub (play a week or sim to the bracket, recruiting hours, the week's install) |
| `/career/recruiting` | Recruiting board (targets, hours, pitches, staff plan) |
| `/career/roster` | Roster viewer |
| `/season` | Season dashboard |
| `/schedule` | Redirects to `/season` |
| `/season/week/:n` | Week game results |
| `/season/standings` | Conference + overall standings |
| `/rankings` | Top 25 + Top 12 projection |
| `/playoffs` | Playoff bracket |
| `/settings` | Confirmations, the matchup estimate, and reset |
| `/login` | Redirects home |
| `/alpha` | Alpha-stage progress tracker |

## Deploy

GitHub Pages serves this app at `/CL26/`. `npm run build:pages` sets that base, and copies `index.html` to `404.html` so a refreshed route such as `/CL26/career` still loads the app. `.nojekyll` is included so Pages does not drop files.

[`.github/workflows/pages.yml`](./.github/workflows/pages.yml) runs on every push to `master`, and it can also be started by hand. Before the first run, open the repo **Settings → Pages** and set **Source** to **GitHub Actions**. The workflow cannot turn that setting on by itself.

Local check of the Pages bundle:

```bash
npm run build:pages
VITE_PAGES_BASE=/CL26/ npx vite preview
```
