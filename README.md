# College Lacrosse Head Coach Sim

A deterministic, web-based college lacrosse head-coaching simulation. Build a program, recruit players, call the shots week by week, and chase a championship — all in the browser with no backend required.

- **128 fictionalized teams** across 16 conferences
- **12-game regular season** (7 conference round-robin + 5 non-conference)
- **Full postseason** — weekly Top 25 + Top 12 bracket projection, 12-team playoff with automatic byes for seeds 1–4
- **Coach career layer** — onboarding, program selection, recruiting board, weekly hub, offseason roster turnover
- **Fully deterministic** — same seed always produces the same schedule, rosters, and results
- **Client-side only** — all state lives in `localStorage` via redux-persist; no server, no account required

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
| `npm run build` | Type-check + production bundle |
| `npm run lint` | ESLint over all TS/TSX files |
| `npm run preview` | Serve the production build locally |
| `npm run test:regression` | Regression tests (requires `bun` on PATH) |

> **Bun is required for tests.** Bun is pre-installed at `~/.bun/bin/bun`; ensure `~/.bun/bin` is on `PATH` before running `test:regression`.

## Architecture at a glance

```
src/
  sim/        Pure deterministic simulation (no React/Redux imports)
  features/   Redux slices — leagueSlice, seasonSlice, coachSlice, uiSlice
  pages/      Route-level UI components
  data/       Static JSON — teams128.json, names.json
  types/      Shared TypeScript domain contracts
  store/      Redux store + redux-persist config
```

**Persistence rules**
- Persisted: `season`, `coach`
- Not persisted: `league` (reloaded from JSON on every launch)

## In-app pages

| Route | Page |
|-------|------|
| `/` | Home / dashboard |
| `/conferences` | Browse all 16 conferences |
| `/team/:id` | Team detail + roster summary |
| `/exhibition` | Seeded exhibition game |
| `/career/setup` | Create coach + choose program |
| `/career` | Career hub |
| `/career/week` | Weekly hub (recruiting hours + focus) |
| `/career/recruiting` | Recruiting board |
| `/career/roster` | Roster viewer |
| `/season` | Season dashboard |
| `/season/week/:n` | Week game results |
| `/season/standings` | Conference + overall standings |
| `/rankings` | Top 25 + Top 12 projection |
| `/playoffs` | Playoff bracket |
| `/alpha` | Alpha-stage progress tracker |
