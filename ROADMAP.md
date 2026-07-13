# College Lacrosse Head Coach Sim — Roadmap

## Vision

A deterministic, web-based college lacrosse coaching sim with NCAA-ish realism and fully fictionalized schools/branding. Core pillars:

- 128-team universe (16 conferences × 8 teams)
- 12-game regular season (7 conference round-robin + 5 non-conference)
- Weekly Top 25 + Top 12 playoff bracket projection
- 12-team playoff (seeds 1–4 auto-bye; R1 = 5v12, 6v11, 7v10, 8v9)
- Multi-year coach career: recruiting, roster turnover, program building

---

## Current Status

### Implemented & Functional
- [x] 128-team league dataset with 16 conferences (JSON)
- [x] Conference / team browsing pages and routing
- [x] Deterministic roster generation (seeded per team)
- [x] Deterministic exhibition game simulation (team, tactics, seed → instant result)
- [x] 12-week regular season schedule generation (64 games/week, no duplicate matchups)
- [x] Week-by-week and full-season simulation
- [x] Standings pages (conference + overall) and per-week game views
- [x] Top 25 rankings engine + Top 12 playoff projection
- [x] 12-team playoff bracket with seeded advancement
- [x] Coach career onboarding (name, archetype, program selection)
- [x] Weekly hub with recruiting hours allocation and practice focus
- [x] Recruiting board management (deterministic recruit pool, board cap, hours cap)
- [x] Recruiting week progression — interest accumulation, commitment triggers
- [x] Offseason signing day flow + roster turnover overlay
- [x] Coach practice/fatigue modifiers wired into weekly sim inputs
- [x] Redux persistence for `season` and `coach` slices; `league` reloads from JSON
- [x] Regression test suite covering schedule, season validation, and playoff logic

### In Progress / Needs Polish
- [x] Rankings criteria exposed in UI (methodology + score breakdowns on Rankings page)
- [x] Week/game detail pages — more depth and drill-down UX
- [x] Career multi-year loop — program prestige drift, job security score
- [ ] Responsive layout — tables are compact but not fully mobile-friendly

### Not Yet Started
- [ ] Transfer portal and graduate-transfer rules
- [ ] News feed and weekly storyline flavor
- [ ] Rivalry game tagging and trophy events
- [ ] Accessibility pass (keyboard navigation, semantic HTML, contrast audit)
- [ ] Settings panel (sim speed, display density)

---

## Alpha Exit Checklist

An **alpha-ready** build means a user can complete a full deterministic year loop, understand outcomes clearly, and save/restore a coach career with stable persistence.

- [x] Rankings methodology documented and visible in Rankings page
- [ ] Playoff bracket flow is fully validated end-to-end via regression tests
- [x] Week/game detail pages provide enough depth to understand individual results
- [x] Career loop can complete two seasons (Year 1 offseason → Year 2 preseason)
- [ ] UI is usable on common desktop and tablet viewports

---

## Milestones

### M1 — League Data + Browsing ✅
- [x] 128 teams, 16 conferences in JSON
- [x] Conferences and Team pages
- [x] Deterministic roster quality summaries

**Key files:** `src/data/teams128.json`, `src/features/league/leagueSlice.ts`, `src/pages/ConferencesPage.tsx`, `src/pages/TeamPage.tsx`, `src/sim/generateRoster.ts`

---

### M2 — Exhibition Game + Match Engine ✅
- [x] Seeded match simulation with tactics inputs
- [x] Final score, team box stats, top performers, highlights
- [x] Same teams + tactics + seed → identical output

**Key files:** `src/sim/rng.ts`, `src/sim/matchEngine.ts`, `src/features/exhibition/exhibitionSlice.ts`, `src/pages/ExhibitionPage.tsx`

---

### M3 — Season Schedule + Simulation + Standings ✅
- [x] 12-week schedule generation (64 games/week, one game per team per week)
- [x] Week-by-week and full-season simulation
- [x] Compact game summaries stored; no per-possession logs
- [x] Standings pages and per-week game views
- [x] Refresh restores full season progress via persistence

**Key files:** `src/sim/schedule.ts`, `src/sim/seasonSim.ts`, `src/features/season/seasonSlice.ts`, `src/pages/SeasonPage.tsx`, `src/pages/SeasonWeekPage.tsx`, `src/pages/SeasonStandingsPage.tsx`

---

### M4 — Rankings (Top 25 + Top 12 Projection) ✅
- [x] Weekly Top 25 computed from win-loss, strength-of-schedule, and quality wins
- [x] Top 12 playoff projection updated each week
- [x] Rankings page live with real data

**Key files:** `src/sim/rankings.ts`, `src/pages/RankingsPage.tsx`

**Remaining:** none for M4 — methodology is visible on the Rankings page

---

### M5 — 12-Team Playoff Bracket ✅
- [x] Seeding from final regular-season Top 12 projection
- [x] Seeds 1–4 auto-bye; Round 1 pairings: 5v12, 6v11, 7v10, 8v9
- [x] Fixed bracket advancement through championship
- [x] Each round simulates and persists deterministically

**Key files:** `src/sim/playoffs.ts`, `src/features/season/seasonSlice.ts`, `src/pages/PlayoffsPage.tsx`

---

### M6 — Coach Career Onboarding + Weekly Hub ✅
- [x] Coach profile creation (name, alma mater, archetype)
- [x] Program selection with difficulty/prestige bands
- [x] Career dashboard with recruiting board, weekly hub, and team snapshot
- [x] Route guard: incomplete setup redirects to `/career/setup`
- [x] Archetype bonuses visible in UI

**Key files:** `src/pages/CoachCareerSetupPage.tsx`, `src/pages/CoachCareerPage.tsx`, `src/pages/WeeklyHubPage.tsx`, `src/features/coach/coachSlice.ts`

---

### M7 — Recruiting Foundation + Battles ✅
- [x] Deterministic recruit pool generation by seed
- [x] Board management (add/remove prospects, board cap)
- [x] Weekly hours allocation with per-recruit and total caps
- [x] Interest accumulation each week with competing CPU-school pressure
- [x] Verbal commitment triggers and lockouts
- [x] Commitments visible in recruiting board UI

**Key files:** `src/sim/recruiting.ts`, `src/sim/recruitingWeek.ts`, `src/pages/RecruitingBoardPage.tsx`, `src/features/coach/coachSlice.ts`

---

### M8 — Signing Day + Roster Turnover ✅
- [x] End-of-season signing day: committed recruits become incoming class
- [x] Graduation/departure model (lightweight, by class year)
- [x] Team talent trend updated before Year 2

**Key files:** `src/sim/offseason.ts`, `src/sim/rosterManagement.ts`, `src/features/coach/careerThunks.ts`

---

### M9 — Coach Effects (Practice / Fatigue / Injuries) ✅
- [x] Practice focus presets (offense / defense / conditioning / discipline)
- [x] Fatigue and recovery status tracked per week
- [x] Lightweight injury risk and availability impact
- [x] Coach modifiers passed into `simulateGame` inputs (match engine stays pure)

**Key files:** `src/sim/coachEffects.ts`, `src/sim/seasonSim.ts`, `src/pages/WeeklyHubPage.tsx`

---

### M10 — Program Identity + Career Progression ✅
- [x] Job security score driven by results vs. expectations
- [x] Program prestige drift (recruiting pull, fan pressure, resource band)
- [x] Multi-year career record tracking with history view
- [x] Job-offer flow after strong seasons

**Key files:** `src/features/coach/coachSlice.ts`, `src/features/coach/careerThunks.ts`, `src/pages/CoachCareerPage.tsx`, `src/pages/SeasonWeekPage.tsx`

**Done when:** A coach can feel a meaningful arc across at least two seasons with visible consequences for performance.

---

### M11 — Flavor Systems (Not Started)
- [ ] News feed and weekly storyline text
- [ ] Rivalry game tagging and trophy events
- [ ] Press conference flavor hooks

---

### M12 — Polish + Accessibility (Not Started)
- [ ] Accessibility pass (keyboard nav, ARIA, contrast)
- [ ] Mobile / tablet responsive tables
- [ ] Settings panel (sim speed, display density, theme toggle)
- [ ] Performance audit for 128-team workflows (virtualized long lists if needed)

---

## Architecture Reference

### Code organization
```
src/sim/        Pure deterministic simulation — no React/Redux imports
src/features/   Redux slices and selectors
src/pages/      Route-level UI
src/data/       Static JSON assets
src/types/      Shared TypeScript domain contracts
src/store/      Store configuration and redux-persist setup
```

### Persistence rules
- **Persist:** `season`, `coach`
- **Do not persist:** `league` — reloaded from JSON at startup

### Key data shapes

**`teams128.json`**
```json
{
  "conferences": [{ "id": "string", "name": "string" }],
  "teams": [{ "id": "string", "schoolName": "string", "nickname": "string", "conferenceId": "string", "region": "string", "prestige": 1 }]
}
```

**`GameSummary`** (compact — no per-possession logs)
```ts
{
  id: string; weekIndex: number;
  homeTeamId: string; awayTeamId: string;
  homeScore: number; awayScore: number;
  teamStatsHome: { goals, shots, saves, turnovers, groundBalls, penalties, faceoffPct };
  teamStatsAway: { goals, shots, saves, turnovers, groundBalls, penalties, faceoffPct };
  topPerformers?: Array<{ playerId, name, teamId, position, goals, assists, saves }>;
}
```

### Determinism rules
- All simulation seeded — same inputs always produce same outputs
- Recruit pool, weekly progression, and tie-breakers derive from stable seed formulas (week + recruit + team IDs)
- Validate determinism with `npm run test:regression`

### Dev commands
| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run lint` | ESLint |
| `npm run preview` | Serve production build locally |
| `npm run test:regression` | Regression tests (requires `bun`) |
