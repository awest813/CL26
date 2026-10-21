# Game Sim Audit, Gap List, and Gameplan

Audit date: 2026-10-21. Scope: everything under `src/sim/`, plus the places in `src/features/` that feed the engine (`seasonSlice.ts` week and playoff thunks, `careerThunks.ts`).

## Health snapshot

- `npm run test:regression`: every suite passes, including the 20-season career harness (about 3 minutes).
- `npm run lint`: clean. `npm run build`: clean.
- ~~`src/sim/timeUtils.test.ts` is not listed in the `test:regression` script.~~ Fixed in Phase 1.
- Determinism holds. Every game, recruit pool, and injury roll comes from a seed.

The career loop around the sim is in good shape: phases, recruiting, signing day, portal, draft, job security. Most of the gaps are in the match engine itself and in the CPU side of the league. The CPU side is static.

## Calibration: before and after Phase 1

Measured with `bun scripts/calibrate-engine.ts`: 6,000 games between generated rosters, default tactics on both sides. The reference column is an approximate NCAA D-I men's per-team average. Use it to find the direction to tune, not as an exact target. `src/sim/matchEngine.calibration.test.ts` now holds the engine inside bands around these numbers.

| Stat (per team per game) | Audit (before) | After Phase 1 | Approx. D-I reference |
|---|---|---|---|
| Goals | 9.4 (p10–p90: 5–14) | 12.0 (7–18) | 11–12 |
| Shots | **15.9** | 37.7 | 33–38 |
| Shots on goal | not tracked | 24.2 | ~22–25 |
| Shooting % | **59%** | 31.8% | 28–31% |
| Save % | **29% of all shots** | 50.4% of shots on goal | ~50–55% of shots on goal |
| Faceoffs per game (both teams) | not modeled | 26.9 | ~25–28 |
| Clear % | not modeled | 87.5% | ~85–88% |
| Ground balls | 19.0 | 28.7 | ~28–32 |
| Turnovers | 11.1 | 12.7 | ~13–15 |
| Penalties | 4.5 | 3.0 | ~3–4 |
| Home win % | 53% | 54.7% | ~55–58% |
| Overtime rate | 7.5% | 5.9% | ~8–10% |
| One-goal games | 22% | 16.4% | ~20–25% |
| Favorite (10+ prestige) win % | 89% | 87.8% | — (L1, Phase 3) |

Sensitivity (two programs of about the same strength, opponent on default tactics):

| Change | Before (baseline 47.8%) | After Phase 1 (baseline 46.5%) |
|---|---|---|
| Offense set crease | 53.8% | 50.6% |
| Ride aggressive | 53.7% | 48.5% |
| Every "aggressive" option at once | **63.1%** | 54.8% (still the best; Phase 2) |
| Faceoff specialist at 95 / at 45 | **65.6% / 26.9%** | 52.5% / 37.7% |
| Goalie at 95 / at 45 | 64.6% / 31.6% | 57.1% / 31.9% |
| A 99-shooting attacker | 0.42 goals per game, same share as a 60-rated teammate | 2.47 goals per game, the team leader |

Before Phase 1, the final scores were right but the box score was wrong. Goals and margins landed in a believable range because two errors cancelled out: too few shots, and too many of them going in. Now the box score itself is close to D-I. Still open: one-goal games and overtime run a little low, because the rating gap between programs still decides too much. That is the static CPU rosters (L1) more than the engine.

---

## Gap list

Severity: **P0** breaks realism or decision-making in a way players will notice. **P1** is a meaningful depth gap. **P2** is polish or flavor.

### A. Match engine (`src/sim/matchEngine.ts`)

| # | Sev | Gap | Where | Notes |
|---|---|---|---|---|
| E1 | ✅ | **Done in Phase 1.** Box score is mis-calibrated.** Shots are about 16 and shooting is about 59%. The possession funnel (penalty → turnover → `shotChance` → miss → save) ends too many possessions with no shot, and the shots that do happen score too often. | `runPossession`, ~L389–495 | Allow several shot attempts per possession (rebound, backup, reset) and split shots from shots on goal. Retune the save chance to about 0.5 of shots on goal. |
| E2 | ✅ | **Done in Phase 1.** Faceoffs did not drive possession. The possession split is fixed once at kickoff (`shareA`), and possessions then strictly alternate. The faceoff % in the box score comes from separate draws taken after the game (`extraFaceoffs`) and has no effect on the result. After a goal there is no faceoff, so a team cannot win a draw and score again. | L327–330, L514, L566–574 | Replace the pre-allocated, interleaved order with a game loop driven by events. A faceoff after every goal and at the start of each quarter decides the next possession. Scoring runs then come out of the play instead of being stitched on afterward. |
| E3 | ✅ | **Done in Phase 1.** Individual skill did not decide who scored. Shooters and assisters are picked by depth weight only (starter 1.78, bench 0.38). Shooting, passing, and IQ only move the team average. | `weightedPlayerForGoal` L252 | Weight shooters by shooting × role × starter weight, and assisters by passing and IQ. This is what makes recruiting a star attacker matter. |
| E4 | P0 | **Dominant scheme, no counters.** Every tactic is a flat bonus, and "all aggressive" is strictly best (+15 pp). Nothing depends on the opponent's scheme or roster. | `offenseBoostFromTactics`, `defenseBoostFromTactics` L156–176 | Add a matchup matrix (for example, zone beats invert, pressure is weak against motion, early slides punish dodge-heavy sets) and real costs (fast tempo raises turnovers; pressure raises fouls and gives up odd-man chances). The goal is no single best setting. |
| E5 | P1 | **Faceoff and goalie ratings are proxies.** Faceoff uses `overall`, passing, speed, and discipline. Goalie uses `defense` and IQ. There is no faceoff or save attribute, and one player moves the win rate by about 35–40 pp. | L120, L132 | Add a position-specific rating (`faceoff` for FO, `saving` for G, generated and developed like the others), and narrow the clamp in `computeFaceoffShare`. A wing ground-ball battle by the LSMs should share the faceoff result. |
| E6 | P1 | **Ground balls are random.** They are `randInt(10, 18)` plus a bonus, rolled before the game, and only turnovers add more. | L332–333 | Generate ground balls from events: faceoff scrums, missed and saved shots that stay live, caused turnovers. Credit a player. |
| E7 | P1 | **Man-up is one possession at +4%.** A defensive flag gives no extra-man possession window, no EMO or man-down stats, and no releasable versus non-releasable penalties. Offensive flags just end the possession. | L404–420 | Model penalty time (30 s, 1 min) as a stretch of possessions at man-up. Track EMO conversion. Tie it to discipline and the slide scheme. |
| E8 | P1 | **Stamina is unused in games, and there is no in-game fatigue.** `stamina` is generated and developed but never read by the engine. Team fatigue only touches the user's modifiers. | `calcRatings`; `coachEffects.ts` | Give midfield lines and in-game fatigue a fourth-quarter decay scaled by stamina and depth. This is the natural home for the "conditioning" install. |
| E9 | P1 | **No game-state behavior.** No stall or keep-away when ahead late, no extra aggression when trailing, no clock. `gameRules.ts` defines the 80 s shot clock and other constants that the engine never reads. | — | Track time per possession (`MEN_SHOT_CLOCK_SECONDS`) so tempo means seconds, and add leading and trailing adjustments in Q4. |
| E10 | ✅ | **Done in Phase 1.** Overtime ended in a coin flip. Three 5-possession periods, then `resolveDeadlockWinner` invents a goal. NCAA overtime is unlimited sudden-death. | L54, L541–562 | With the event loop from E2, run sudden-death until someone scores (with a safety cap that is actually never hit). |
| E11 | P1 | **Thin player stat lines.** Only goals, assists, and saves. No shots, ground balls, caused turnovers, turnovers, faceoffs won, or penalties per player. Only the top 5 per team are returned, and only 2 per team are stored in `GameSummary`. | `PlayerGameStats` in `types/sim.ts` | This blocks season stat leaders, awards, All-American teams, and draft logic based on production. |
| E12 | ✅ | **Done in Phase 1.** Some highlights were made up. Filler lines (L582–594) are rolled at random times and do not describe events from the game. | L582 | Generate highlights only from real events. Fewer and accurate beats more and invented. |
| E13 | P2 | **Partly done in Phase 1:** clears and rides are events now (clear %, failed clears, beaten rides turning into transition chances). Still missing: 20-second violations. Original gap: clears and rides were not events. `rideClear` only moves the offense's own turnover rate and offense boost. There are no failed clears, rides, or 20-second violations. | L392–396 | Add them as part of the E2 event loop. |
| E14 | P2 | **Home field is a flat bump, applied in every game.** The playoff semifinals and final use it too (`simulateGame` defaults `homeAdvantageForA: true`), although those are neutral-site in the NCAA format. | L326; `playoffs.ts` L294 | Pass `homeAdvantageForA: false` for the semifinals and final. Optional: scale the bump by program or fan support. |

### B. League ecosystem: CPU programs

| # | Sev | Gap | Where | Notes |
|---|---|---|---|---|
| L1 | P0 | **CPU strength is fixed by static prestige.** CPU rosters are `generateRoster(team, seasonSeed)` each year, with baseline `45 + prestige × 0.4`. CPU recruiting commits, portal departures, and the pro draft never change a CPU roster. Prestige drift applies only to the user's program (`withProgramPrestige`). The result: a top program is always a top program, and favorites win 89% of games. | `generateRoster.ts` L20, `seasonSlice.ts` ~L103, `rankings.ts` L62 | Give CPU programs persistent rosters (or a lightweight talent ledger per team: an incoming-class average and departures) that ingest CPU commits from `recruitingWeek.ts`, and add CPU prestige drift from results. This is the biggest gap in how the league plays out over a long career. |
| L2 | P0 | **Every CPU team plays default tactics.** No CPU coach identity, and no per-opponent scouting. | `seasonSlice.ts` L149–150, `playoffs.ts` L291 | Give each program a deterministic scheme from seed and roster, with an optional per-game adjustment. Needed so E4 counters matter, and so scouting the opponent becomes a weekly decision. |
| L3 | P1 | **CPU teams never get injured or tired.** `weeklyScratches` and fatigue only touch the user's roster. | `seasonSlice.ts` L130 | Run the same scratch roll for every team (it is already seeded per team), or a cheap equivalent. |
| L4 | P1 | **Roster size is 25 against a 48 cap.** There is no depth at most positions (one FO, one G, one LSM in the primary set), so a single injury at FO or G is decisive. | `POSITION_DISTRIBUTION`; `gameRules.ts` `MEN_ROSTER_MAX` | Generate a 2-deep chart at FO and G at minimum. Decide whether the sim should model about 40-man rosters with a gameday 10 plus lines. |
| L5 | P1 | **Prestige range is narrow (48–90),** and rankings add prestige points directly. The poll favors brand over results early in the season. | `teams128.json`; `RANKING_WEIGHTS.prestige` | Taper prestige's weight in the poll toward 0 as weeks go by, the way a preseason poll fades. |

### C. Season, rankings, playoffs

| # | Sev | Gap | Where | Notes |
|---|---|---|---|---|
| S1 | P0 | **No conference automatic bids or conference tournaments.** The field is simply the top 12 of the poll. The product goal says "NCAA-ish", and auto bids are the core of NCAA-ish. | `selectPlayoffField` | At minimum, conference regular-season champions get priority, or the N highest-rated conference champions get auto bids. A one-weekend conference tournament (8 teams per conference fits neatly) is a bigger option. |
| S2 | P1 | **The poll rewards running up the score.** Point differential is uncapped at 2 points per goal, and `scoringVolume` rewards raw goals scored. SOS is first-order only (opponents' win %). No head-to-head, no quality-win or bad-loss tiers, even though the README advertises "quality wins". | `rankings.ts` L13–20, L78–98 | Cap the margin per game (for example, 5), drop scoring volume, add opponents' opponents to SOS (RPI-style 25/50/25), and add quality-win bonuses by opponent rank. |
| S3 | P1 | **No rivalry or trophy games, and the non-conference schedule is random.** No regional bias and no annual rivals. | `schedule.ts` | Lock 1–2 non-conference games to rivals and regional neighbors, seeded once per league. Ties into M11. |
| S4 | P2 | **The matchup estimate is not the engine.** `estimateWinChance` is a prestige-ratio formula, so it disagrees with the engine on faceoff and goalie edges and on tactics. | `winEstimate.ts` | After E1–E5, replace it with a cheap Monte Carlo (about 200 seeded engine runs) or a fitted logistic model from the calibration script. |
| S5 | P2 | **The semifinals and final have home field.** See E14. | | |

### D. Coach, roster, and development loop

| # | Sev | Gap | Where | Notes |
|---|---|---|---|---|
| D1 | P1 | **Potential stops mattering after signing day.** `developPlayers` growth depends on year and coach bonuses only. A 5-star with a 95 ceiling develops like a 2-star. | `rosterManagement.ts` ~L104 | Store `potential` on `Player` and scale growth by the room to potential. Add slight regression for seniors. |
| D2 | P1 | **Injuries are one week only.** Each week is a fresh roll with no carry-over, no severity, and no season-ending injuries, so the injured-reserve and redshirt flags in `gameRules.ts` have nothing to act on. | `injuries.ts` L34 | Add duration (1–6 weeks, rare season-ending) and keep active injuries in `coachSlice`. Redshirts can follow later. |
| D3 | P1 | **User roster against CPU rosters has never been measured over a long career.** The user's roster develops and recruits while the CPU stays static (L1). The 20-season harness only asserts an average overall below 94. | `careerTwentySeason.test.ts` | Add an assertion that the user's roster average stays within a band of the top CPU programs, and log the user's win % per season so drift is visible. |
| D4 | P2 | **Depth-chart lines.** Starters are a flat set. There are no first and second midfield lines, no short-stick D-middies, and no faceoff wing assignment. | `buildDefaultStarters` | Comes with E8 (line fatigue). |

### E. Tooling and tests

| # | Sev | Gap | Notes |
|---|---|---|---|
| T1 | ✅ | **Done in Phase 1** (`matchEngine.calibration.test.ts`). No calibration guard. The engine can drift silently. | `scripts/calibrate-engine.ts` (added with this audit) prints the tables above. Next: a fast `matchEngine.calibration.test.ts` that asserts bands (for example, shots 30–40, shooting 26–34%, home win 52–60%) on about 1,000 games. |
| T2 | ✅ | **Done in Phase 1.** `timeUtils.test.ts` is not in `test:regression`. | Add it to the script. |
| T3 | P2 | Season and playoff sims build every roster with `generateRoster` inside the loop, so each roster is regenerated many times per week. | Memoize per (team, seed) or keep it in the league ledger from L1. This matters once rosters become persistent. |

---

## Gameplan

Order matters. Engine calibration comes first, because every later system (CPU rosters, schemes, rankings) is tuned against the engine's output. Each phase ships on its own and keeps the regression suite green. The engine stays pure in `src/sim/`.

### Phase 1: calibration harness and engine core (E1, E2, E3, E10, T1, T2) — ✅ done

Shipped: an event-driven `simulateGame` with the same signature and `GameResult` shape. It has:
- a draw after every goal and at each period start
- clears and rides
- up to five shots per possession, with backups and rebounds
- an 80-second shot clock, and possession length set by tempo
- unlimited sudden-death overtime
- shooters picked by shooting and IQ, feeders by passing and IQ
- optional new stats: shots on goal, faceoff wins and draws taken, clears, and per-player shots, ground balls, and caused turnovers
- highlights built only from real events

Calibration bands and event-model tests live in `src/sim/matchEngine.calibration.test.ts`. Saved games keep their stored results. New games use the new engine.

Original plan:


1. Turn `scripts/calibrate-engine.ts` into banded assertions (`matchEngine.calibration.test.ts`) and add it, along with `timeUtils.test.ts`, to `test:regression`. Start with the bands loose, around today's values, then tighten them as the engine moves.
2. Rewrite the inner loop as an event loop: faceoff → possession (clear → settled offense → shot attempts → rebound or reset) → next faceoff or change of possession. Keep the public `simulateGame` signature and `GameResult` shape so the UI and slices do not change.
3. Shooter and assister selection uses player ratings (E3).
4. Sudden-death overtime until someone scores (E10).
5. Tune until shots are about 35, shooting about 30%, save % about 0.5 of shots on goal, and goals about 11.

**Done when:** the calibration test passes inside realistic bands, the faceoff % in the box score is the number that decided possessions, and a 99-shooting attacker leads the team in goals.

**Determinism note:** game results change for the same seed. Existing saves keep their stored results, which is fine because results are persisted, not replayed. Update the snapshot-style expectations in `matchEngine.test.ts` deliberately, in one commit.

### Phase 2: tactics that trade off (E4, E5, E7, L2)

1. A scheme matchup matrix plus explicit costs. Add a calibration row asserting that no single tactic set beats default by more than about 5 pp against every opponent scheme.
2. `faceoff` and `saving` attributes. Migration: derive them for existing saved rosters from current fields when a save loads (in `careerThunks`), and generate them for new players.
3. Real man-up windows and EMO stats.
4. CPU coach identities: a deterministic scheme per program, shown in the Weekly Hub as a scouting line for the opponent.

**Done when:** the "best scheme" depends on the opponent, and the Weekly Hub can say why.

### Phase 3: a living league (L1, L3, L4, L5, D3, T3)

Decided: CPU programs get a talent ledger, not full rosters. Generated rosters move to about 32 players, two deep at every position.

1. A CPU talent ledger persisted in `season` (it is gameplay state, so it fits the whitelist): per-team rating offsets updated at signing day from CPU commits, departures, and draft picks. `generateRoster` takes the offset. This keeps storage small and avoids persisting 127 full rosters.
2. CPU prestige drift from results, with the same clamp as the user's program.
3. CPU injuries using the existing seeded scratch roll.
4. Deeper generated rosters (2 FO, 2 G, a second midfield line).
5. A balance assertion in the 20-season harness (D3).

**Done when:** over 20 seasons, programs rise and fall, and a CPU program that signs top classes for three years climbs the poll.

### Phase 4: NCAA-ish postseason and poll (S1, S2, S3, E14)

Decided: the 6 highest-ranked conference champions get guaranteed bids. The other 6 spots are at-large.

1. Neutral-site semifinals and final.
2. Poll fixes: capped margin, no scoring-volume term, RPI-style SOS, quality-win tiers, and prestige weight that fades through the season. Update the methodology copy on the Rankings page.
3. Conference automatic bids (design decision below). Optional: conference tournaments.
4. Rivalry games and trophies in the schedule. This feeds M11, the news feed.

### Phase 5: depth and flavor (E6, E8, E9, E11, E12, E13, D1, D2, D4, S4)

Player stat lines and season leaders, then awards and All-Americans. Line fatigue and stamina. Clock and game-state behavior. Multi-week injuries. Development that respects potential. Highlights built only from real events. A matchup estimate driven by the engine.

---

## Design decisions (settled 2026-10-21)

1. **Auto bids:** the 6 highest-ranked conference champions get guaranteed bids, and the other 6 spots are at-large. This is built in Phase 4.
2. **Roster scale:** about 32 generated players, two deep at every position. This is built in Phase 3.
3. **Men's or women's:** men's only through alpha. The women's constants stay in `gameRules.ts`, unused.
4. **CPU rosters:** a small talent record per team, not 127 saved rosters. This is built in Phase 3.
