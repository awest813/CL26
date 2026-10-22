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

### After Phase 2

The box score held: 12.1 goals on 38.6 shots per team, 31.4% shooting, a 51.0% save rate on shots on goal, and 29.1 ground balls. Man-up is new: 2.7 chances per team per game, converted at 34.8% (D-I runs roughly 3 chances at 30–35%).

| Check | After Phase 1 | After Phase 2 |
|---|---|---|
| Every "aggressive" option at once | 54.8% win (+8 pp) | 51.8% (+3 pp), and an opponent scheme can take it to zero |
| Best worst-case edge over default, across all 324 schemes against 24 opponent schemes | not measured | **+1.1 pp**: every scheme has a counter |
| Faceoff man rated 95 vs 50 (new `faceoff` rating) | — | 50.1% vs 40.6% win |
| Goalie rated 95 vs 50 (new `saving` rating) | — | 59.8% vs 42.2% win |

Run `bun scripts/calibrate-engine.ts --schemes` for the full scheme search (about 4 minutes).

---

## Gap list

Severity: **P0** breaks realism or decision-making in a way players will notice. **P1** is a meaningful depth gap. **P2** is polish or flavor.

### A. Match engine (`src/sim/matchEngine.ts`)

| # | Sev | Gap | Where | Notes |
|---|---|---|---|---|
| E1 | ✅ | **Done in Phase 1.** Box score is mis-calibrated.** Shots are about 16 and shooting is about 59%. The possession funnel (penalty → turnover → `shotChance` → miss → save) ends too many possessions with no shot, and the shots that do happen score too often. | `runPossession`, ~L389–495 | Allow several shot attempts per possession (rebound, backup, reset) and split shots from shots on goal. Retune the save chance to about 0.5 of shots on goal. |
| E2 | ✅ | **Done in Phase 1.** Faceoffs did not drive possession. The possession split is fixed once at kickoff (`shareA`), and possessions then strictly alternate. The faceoff % in the box score comes from separate draws taken after the game (`extraFaceoffs`) and has no effect on the result. After a goal there is no faceoff, so a team cannot win a draw and score again. | L327–330, L514, L566–574 | Replace the pre-allocated, interleaved order with a game loop driven by events. A faceoff after every goal and at the start of each quarter decides the next possession. Scoring runs then come out of the play instead of being stitched on afterward. |
| E3 | ✅ | **Done in Phase 1.** Individual skill did not decide who scored. Shooters and assisters are picked by depth weight only (starter 1.78, bench 0.38). Shooting, passing, and IQ only move the team average. | `weightedPlayerForGoal` L252 | Weight shooters by shooting × role × starter weight, and assisters by passing and IQ. This is what makes recruiting a star attacker matter. |
| E4 | ✅ | **Done in Phase 2** (`schemeMatchups.ts`). Was: dominant scheme, no counters. Every tactic is a flat bonus, and "all aggressive" is strictly best (+15 pp). Nothing depends on the opponent's scheme or roster. | `offenseBoostFromTactics`, `defenseBoostFromTactics` L156–176 | Add a matchup matrix (for example, zone beats invert, pressure is weak against motion, early slides punish dodge-heavy sets) and real costs (fast tempo raises turnovers; pressure raises fouls and gives up odd-man chances). The goal is no single best setting. |
| E5 | ✅ | **Done in Phase 2** (`faceoff` and `saving` ratings, wing play on the draw). Was: faceoff and goalie ratings were proxies. Faceoff uses `overall`, passing, speed, and discipline. Goalie uses `defense` and IQ. There is no faceoff or save attribute, and one player moves the win rate by about 35–40 pp. | L120, L132 | Add a position-specific rating (`faceoff` for FO, `saving` for G, generated and developed like the others), and narrow the clamp in `computeFaceoffShare`. A wing ground-ball battle by the LSMs should share the faceoff result. |
| E6 | ✅ | **Done across Phases 1 and 5.** Ground balls come from draws, turnovers, misses, and rebounds and are credited to players. A small pool of loose balls with no event behind them remains. Was: ground balls were random. They are `randInt(10, 18)` plus a bonus, rolled before the game, and only turnovers add more. | L332–333 | Generate ground balls from events: faceoff scrums, missed and saved shots that stay live, caused turnovers. Credit a player. |
| E7 | ✅ | **Done in Phase 2.** 30-second releasable technicals, 1–2 minute personal fouls served in full, and man-up stats. Was: man-up lasted one possession at +4%. A defensive flag gives no extra-man possession window, no EMO or man-down stats, and no releasable versus non-releasable penalties. Offensive flags just end the possession. | L404–420 | Model penalty time (30 s, 1 min) as a stretch of possessions at man-up. Track EMO conversion. Tie it to discipline and the slide scheme. |
| E8 | ✅ | **Done in Phase 5:** in-game wear from stamina, rotation depth, and scheme. Was: stamina was unused in games, and there was no in-game fatigue. `stamina` is generated and developed but never read by the engine. Team fatigue only touches the user's modifiers. | `calcRatings`; `coachEffects.ts` | Give midfield lines and in-game fatigue a fourth-quarter decay scaled by stamina and depth. This is the natural home for the "conditioning" install. |
| E9 | ✅ | **Done in Phase 5:** stall, hurry, and desperation in the last five minutes. Was: no game-state behavior. No stall or keep-away when ahead late, no extra aggression when trailing, no clock. `gameRules.ts` defines the 80 s shot clock and other constants that the engine never reads. | — | Track time per possession (`MEN_SHOT_CLOCK_SECONDS`) so tempo means seconds, and add leading and trailing adjustments in Q4. |
| E10 | ✅ | **Done in Phase 1.** Overtime ended in a coin flip. Three 5-possession periods, then `resolveDeadlockWinner` invents a goal. NCAA overtime is unlimited sudden-death. | L54, L541–562 | With the event loop from E2, run sudden-death until someone scores (with a safety cap that is actually never hit). |
| E11 | ✅ | **Done in Phase 5:** full box scores, a season stat ledger, a Leaders page, five national awards, and first and second All-American teams. Was: thin player stat lines. Only goals, assists, and saves. No shots, ground balls, caused turnovers, turnovers, faceoffs won, or penalties per player. Only the top 5 per team are returned, and only 2 per team are stored in `GameSummary`. | `PlayerGameStats` in `types/sim.ts` | This blocks season stat leaders, awards, All-American teams, and draft logic based on production. |
| E12 | ✅ | **Done in Phase 1.** Some highlights were made up. Filler lines (L582–594) are rolled at random times and do not describe events from the game. | L582 | Generate highlights only from real events. Fewer and accurate beats more and invented. |
| E13 | ✅ | **Done:** 20-second violations show up in the play-by-play as one kind of failed clear (after Phase 5). Earlier, in Phase 1: clears and rides are events now (clear %, failed clears, beaten rides turning into transition chances). Still missing: 20-second violations. Original gap: clears and rides were not events. `rideClear` only moves the offense's own turnover rate and offense boost. There are no failed clears, rides, or 20-second violations. | L392–396 | Add them as part of the E2 event loop. |
| E14 | ✅ | **Neutral sites done in Phase 4; after Phase 5, home field scales with program size** (`homeFieldScale`: about 0.8× for the smallest programs, 1.4× for the biggest). Was: home field was a flat bump, applied in every game. The playoff semifinals and final use it too (`simulateGame` defaults `homeAdvantageForA: true`), although those are neutral-site in the NCAA format. | L326; `playoffs.ts` L294 | Pass `homeAdvantageForA: false` for the semifinals and final. Optional: scale the bump by program or fan support. |

### B. League ecosystem: CPU programs

| # | Sev | Gap | Where | Notes |
|---|---|---|---|---|
| L1 | ✅ | **Done in Phase 3** (`programLedger.ts`). Was: CPU strength fixed by static prestige. CPU rosters are `generateRoster(team, seasonSeed)` each year, with baseline `45 + prestige × 0.4`. CPU recruiting commits, portal departures, and the pro draft never change a CPU roster. Prestige drift applies only to the user's program (`withProgramPrestige`). The result: a top program is always a top program, and favorites win 89% of games. | `generateRoster.ts` L20, `seasonSlice.ts` ~L103, `rankings.ts` L62 | Give CPU programs persistent rosters (or a lightweight talent ledger per team: an incoming-class average and departures) that ingest CPU commits from `recruitingWeek.ts`, and add CPU prestige drift from results. This is the biggest gap in how the league plays out over a long career. |
| L2 | ✅ | **Done in Phase 2.** Each program has a fixed scheme identity, and the Weekly Hub scouts it. CPU staffs also adjust per game (after Phase 5): each has a seeded adaptability, counters the opponent's offense with its defense package (and, less often, its defense with its offense set), and the hub scouts exactly what they will run and says what they changed. Was: every CPU team played default tactics. No CPU coach identity, and no per-opponent scouting. | `seasonSlice.ts` L149–150, `playoffs.ts` L291 | Give each program a deterministic scheme from seed and roster, with an optional per-game adjustment. Needed so E4 counters matter, and so scouting the opponent becomes a weekly decision. |
| L3 | ✅ | **Injuries done in Phase 3**; CPU fatigue is still open. Was: CPU teams never got injured or tired. `weeklyScratches` and fatigue only touch the user's roster. | `seasonSlice.ts` L130 | Run the same scratch roll for every team (it is already seeded per team), or a cheap equivalent. |
| L4 | ✅ | **Done in Phase 3:** 32-man rosters, two deep at every position. Was: roster size was 25 against a 48 cap. There is no depth at most positions (one FO, one G, one LSM in the primary set), so a single injury at FO or G is decisive. | `POSITION_DISTRIBUTION`; `gameRules.ts` `MEN_ROSTER_MAX` | Generate a 2-deep chart at FO and G at minimum. Decide whether the sim should model about 40-man rosters with a gameday 10 plus lines. |
| L5 | ✅ | **Done in Phase 3:** prestige fades out of the poll by game 10. Was: prestige range was narrow (48–90), and rankings add prestige points directly. The poll favors brand over results early in the season. | `teams128.json`; `RANKING_WEIGHTS.prestige` | Taper prestige's weight in the poll toward 0 as weeks go by, the way a preseason poll fades. |

### C. Season, rankings, playoffs

| # | Sev | Gap | Where | Notes |
|---|---|---|---|---|
| S1 | ✅ | **Auto bids done in Phase 4; conference championships added after Phase 5.** The top four in each conference play a semifinal and a final between week 12 and selection, and the six highest-ranked tournament champions get the automatic bids. Tournament games do not count in records or the poll. Was: no conference automatic bids or conference tournaments. The field is simply the top 12 of the poll. The product goal says "NCAA-ish", and auto bids are the core of NCAA-ish. | `selectPlayoffField` | At minimum, conference regular-season champions get priority, or the N highest-rated conference champions get auto bids. A one-weekend conference tournament (8 teams per conference fits neatly) is a bigger option. |
| S2 | ✅ | **Done in Phase 4**, plus head-to-head after Phase 5: two teams within 25 poll points are ordered by their game. Was: the poll rewarded running up the score. Point differential is uncapped at 2 points per goal, and `scoringVolume` rewards raw goals scored. SOS is first-order only (opponents' win %). No head-to-head, no quality-win or bad-loss tiers, even though the README advertises "quality wins". | `rankings.ts` L13–20, L78–98 | Cap the margin per game (for example, 5), drop scoring volume, add opponents' opponents to SOS (RPI-style 25/50/25), and add quality-win bonuses by opponent rank. |
| S3 | ✅ | **Done in Phase 4:** one annual rival per program and a trophy for each pair. After Phase 5, the four open non-conference weeks lean regional, with about half of those games inside the region. Was: no rivalry or trophy games, and the non-conference schedule was random. No regional bias and no annual rivals. | `schedule.ts` | Lock 1–2 non-conference games to rivals and regional neighbors, seeded once per league. Ties into M11. |
| S4 | ✅ | **Done in Phase 5:** the hub plays the matchup 160 times through the engine. Was: the matchup estimate was not the engine. `estimateWinChance` is a prestige-ratio formula, so it disagrees with the engine on faceoff and goalie edges and on tactics. | `winEstimate.ts` | After E1–E5, replace it with a cheap Monte Carlo (about 200 seeded engine runs) or a fitted logistic model from the calibration script. |
| S5 | ✅ | **Done in Phase 4.** Was: the semifinals and final had home field. See E14. | | |

### D. Coach, roster, and development loop

| # | Sev | Gap | Where | Notes |
|---|---|---|---|---|
| D1 | ✅ | **Done in Phase 5.** Senior decline was considered and dropped: seniors graduate before the next season, and college players do not decline with age. Was: potential stopped mattering after signing day. `developPlayers` growth depends on year and coach bonuses only. A 5-star with a 95 ceiling develops like a 2-star. | `rosterManagement.ts` ~L104 | Store `potential` on `Player` and scale growth by the room to potential. Add slight regression for seniors. |
| D2 | ✅ | **Done in Phase 5:** 1–6 week injuries and season-enders, stateless and the same for every team. Redshirts came after Phase 5: before week 1 a coach can sit a player for the season (one per player, no seniors, never thinning a position below the starters plus one). He still develops and keeps his class year, shown as "RS". Was: injuries lasted one week only. Each week is a fresh roll with no carry-over, no severity, and no season-ending injuries, so the injured-reserve and redshirt flags in `gameRules.ts` have nothing to act on. | `injuries.ts` L34 | Add duration (1–6 weeks, rare season-ending) and keep active injuries in `coachSlice`. Redshirts can follow later. |
| D3 | ✅ | **Done in Phase 3:** the career harness checks the user's roster against the top ten CPU rosters each season and logs win % by year. Was: user roster against CPU rosters had never been measured over a long career. The user's roster develops and recruits while the CPU stays static (L1). The 20-season harness only asserts an average overall below 94. | `careerTwentySeason.test.ts` | Add an assertion that the user's roster average stays within a band of the top CPU programs, and log the user's win % per season so drift is visible. |
| D5 | Mitigated | **Phase 5 measured it and softened it.** Diagnosis: late in a career the user's starters (about 85) are *below* the best CPU programs (about 90), but play an average conference schedule with a maxed coaching tree, in an engine where the better team won too often. Potential-capped growth, game-to-game form, and a softer rating-to-result curve brought late-career seasons from 83–100% wins to mostly 67–92%. After Phase 5, skill-tree levels give diminishing game-day returns (a maxed tree is worth about +9 pp instead of +10, since much of the edge was the install), and the weekly installs were rebalanced to within about 3 pp of each other. The discipline install had been a clear best at +6–10 pp. Original gap: late careers turned into dynasties. In the 100-season harness, the user's program wins 83–100% of its regular-season games from about year 20 on (a 58–83% band before that). The roster stays inside the top-ten band, so the edge comes from the maxed coach skill tree, archetype bonuses, and program resources stacking on game day, not from roster talent. | `coachEffects.ts` `buildCoachGamePlan`; `careerThunks.ts` | Cap the combined game-day modifiers, or make coach skill gains taper. Then add a harness check on late-career win %. |
| D4 | Partly done | **The second midfield line matters in Phase 5** through rotation relief on fatigue. Explicit line changes, short-stick defensive middies, and wing assignments are still open. Was: depth-chart lines. Starters are a flat set. There are no first and second midfield lines, no short-stick D-middies, and no faceoff wing assignment. | `buildDefaultStarters` | Comes with E8 (line fatigue). |

### E. Tooling and tests

| # | Sev | Gap | Notes |
|---|---|---|---|
| T1 | ✅ | **Done in Phase 1** (`matchEngine.calibration.test.ts`). No calibration guard. The engine can drift silently. | `scripts/calibrate-engine.ts` (added with this audit) prints the tables above. Next: a fast `matchEngine.calibration.test.ts` that asserts bands (for example, shots 30–40, shooting 26–34%, home win 52–60%) on about 1,000 games. |
| T2 | ✅ | **Done in Phase 1.** `timeUtils.test.ts` is not in `test:regression`. | Add it to the script. |
| T3 | ✅ | **Done in Phase 3:** `programRoster` caches each CPU roster per season and standing. Was: season and playoff sims built every roster with `generateRoster` inside the loop, so each roster is regenerated many times per week. | Memoize per (team, seed) or keep it in the league ledger from L1. This matters once rosters become persistent. |

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

### Phase 2: tactics that trade off (E4, E5, E7, L2) — ✅ done

Shipped:
- **Scheme matchups.** `src/sim/schemeMatchups.ts` holds a table of offense set against defense package, slide timing against offense set, and costs for tempo, ride, and package. Motion beats zone and pressure but stalls against man. Invert beats man and is walled off by zone. Crease beats pressure and man and is smothered by zone. Early slides stop dodgers and get skipped around by motion; late slides do the reverse. The tactic hints in the selects say this.
- **Specialist ratings.** `faceoff` and `saving` are optional fields on `Player`. Every new player gets them: generated rosters, recruits, walk-ons, and portal players. Development grows them. Players saved before the ratings existed fall back to the old engine blend (`src/sim/playerSpecialty.ts`), so no save migration is needed. The roster page shows FO and SV for specialists.
- **Penalty time.** Technicals are 30 seconds and released by a goal. Personal fouls are 1 minute (sometimes 2) and served in full. A man-up offense attacks inside its window, and penalties carry across periods. Teams track `extraManGoals` and `extraManOpportunities`.
- **CPU identities.** `programTactics(team)` gives each school one scheme, seeded by its id, and the season, the playoffs, and `seasonSim` all use it. The Weekly Hub scouts the opponent: its five calls, your offense against its defense, its offense against yours, and the call that would line up better. The game-day edge and the matchup estimate read against that opponent.
- **Tests.** `schemeMatchups.test.ts`, `playerSpecialty.test.ts`, and new blocks in `matchEngine.calibration.test.ts`: man-up bands, specialists, discipline against man-up chances, and a Monte Carlo check that none of 8 candidate schemes beats default by more than 5 pp against every opponent.

Original plan:


1. A scheme matchup matrix plus explicit costs. Add a calibration row asserting that no single tactic set beats default by more than about 5 pp against every opponent scheme.
2. `faceoff` and `saving` attributes. Migration: derive them for existing saved rosters from current fields when a save loads (in `careerThunks`), and generate them for new players.
3. Real man-up windows and EMO stats.
4. CPU coach identities: a deterministic scheme per program, shown in the Weekly Hub as a scouting line for the opponent.

**Done when:** the "best scheme" depends on the opponent, and the Weekly Hub can say why.

### Phase 3: a living league (L1, L3, L4, L5, D3, T3)

Decided: CPU programs get a talent ledger, not full rosters. Generated rosters move to about 32 players, two deep at every position.

**✅ Done.** Shipped:
- **Program ledger.** `season.programLedger` is saved with the season. For each CPU program it holds:
  - `prestigeDrift`: results against the wins its prestige rank predicts. A title is +4, a bracket +2, meeting expectations +1, and a big miss −2 or −3. It keeps 90% each year and is clamped to −20…+30, the same as the user's drift.
  - `talent`: each class's stars against what programs of that prestige signed this year, at 0.3 rating points per star. Each early pro departure is −0.8. It keeps 70% each year and is clamped to ±8.
  - `lastClass`, for display.
  `processSeasonEnd` folds each season in once (guarded by `programLedgerYear`).
- **Rosters from the ledger.** CPU rosters come from `programRoster`: base prestige plus drift, plus talent as a rating offset, cached per season. CPU programs start a staff depth chart (`programStarters`) and lose players to the same weekly injury roll the user's program does, in the regular season and the bracket. Rising programs also recruit at their current prestige.
- **Job changes.** Prestige stays with the program. Taking a job inherits the new school's earned prestige, and the old school keeps what the coach built there.
- **Rosters of 32.** Two deep everywhere: A 7, M 10, D 7, LSM 3, FO 2, G 3. The first 25 generated players keep their old ratings. Offseason turnover, signing-day needs, and recruiting needs all use the same targets. The default depth chart starts the best faceoff man and goalie by their specialist ratings.
- **Poll.** Prestige fades out of the poll by game 10, and the Rankings page says so.
- **Team page.** Shows a CPU program's earned prestige, recruiting talent, and last class.
- **Tests.** `programLedger.test.ts` (drift, fading, class talent, early pros, bounds, the user's program left alone, and a program with three straight top classes beating its old peer more than 60% of the time). The career harness now checks the ledger every season, the two-deep roster, the user's roster against the top ten CPU rosters, and that by the end some programs rose, some fell, and at least two left the top ten.

Measured: across 20 seasons, 3 of the starting top ten dropped out; across 100, 4 did. The box score held at 12.3 goals on 38.8 shots per team, with every CPU side fielding a depth chart. Within a single season, favorites still win about 88% of games against teams 10+ prestige points lower. Programs now move over years, but a given season is still chalky. Phase 4's poll work and a narrower prestige-to-rating slope are the next levers.

1. A CPU talent ledger persisted in `season` (it is gameplay state, so it fits the whitelist): per-team rating offsets updated at signing day from CPU commits, departures, and draft picks. `generateRoster` takes the offset. This keeps storage small and avoids persisting 127 full rosters.
2. CPU prestige drift from results, with the same clamp as the user's program.
3. CPU injuries using the existing seeded scratch roll.
4. Deeper generated rosters (2 FO, 2 G, a second midfield line).
5. A balance assertion in the 20-season harness (D3).

**Done when:** over 20 seasons, programs rise and fall, and a CPU program that signs top classes for three years climbs the poll.

### Phase 4: NCAA-ish postseason and poll (S1, S2, S3, E14)

Decided: the 6 highest-ranked conference champions get guaranteed bids. The other 6 spots are at-large.

**✅ Done.** Shipped:
- **Automatic bids.** `buildPlayoffField` takes the full poll and the conference champions (`conferenceLeaders`, the top of each conference table). The 6 highest-ranked champions get in, then the 6 best-ranked teams left. Seeds follow the poll, so a champion ranked 33rd enters as the 12 seed. Seeds carry `autoBid`. The Rankings page shows the projected field with "Auto bid" (the conference is on hover), each seed's poll rank where it differs, and the first four teams out. The Playoffs page marks auto bids.
- **Neutral sites.** The semifinals and championship are played with no home field (`isNeutralSiteRound`). The Playoffs page labels them.
- **Poll.** `computePollInputs` replaces the bare SOS map:
  - Margin is capped at 5 goals a game, at 3 points per goal.
  - The scoring-volume term is gone.
  - SOS is RPI-style: two parts opponents' win % and one part their opponents' win %, at weight 400.
  - A win over a .667+ team adds 40 and over a .500+ team 15; a loss to a sub-.333 team costs 40.
  The Rankings page explains each line, and the score breakdown shows "Margin (capped)" and "Quality wins and bad losses".
- **Rivalries.** `src/sim/rivalries.ts` pairs every program, for good, with a school in its own region from another conference: 64 pairs, each with its own trophy ("The Iron Shield"). Week 12 is rivalry week, every game in it is a rivalry, and rivals never meet earlier. `season.trophyHolders` tracks who holds each trophy across seasons. Where it shows up:
  - the Weekly Hub matchup line ("Rivalry: The Iron Shield · up for grabs")
  - the week-12 results (subtitle and a trophy tag on every game)
  - the user's result card ("… takes home The Iron Shield")
  - the team page ("Rival: … · The Iron Shield (held by …)")
- **Tests.** Field selection (six auto bids, at-large fill, poll-order seeds, first four out), neutral sites, margin cap, quality wins and bad losses, RPI SOS, "running up the score does not beat better wins", rivalry pairing (one rival each, same region, different conference, unique trophies, stable), and rivalry week on three seeds. The career harness checks six auto bids and 64 trophy holders every season.

Existing saves: a bracket set before this phase has no `autoBid` flags. Its rivalry trophies start empty and fill in at the next rivalry week. Schedules already generated keep their old week 12.

1. Neutral-site semifinals and final.
2. Poll fixes: capped margin, no scoring-volume term, RPI-style SOS, quality-win tiers, and prestige weight that fades through the season. Update the methodology copy on the Rankings page.
3. Conference automatic bids (design decision below). Optional: conference tournaments.
4. Rivalry games and trophies in the schedule. This feeds M11, the news feed.

### Phase 5: depth and flavor (E6, E8, E9, E11, E12, E13, D1, D2, D4, S4) — ✅ done

Shipped in four commits:
1. **Injuries and development.**
   - Injuries run 1–6 weeks, with rare season-enders (a torn ACL). The weekly roll stays stateless: replaying the season so far finds who is still out, so CPU programs get the same model with nothing saved. The hub and roster show the injury and the weeks left.
   - Players carry a `potential` ceiling. It comes from the scouting grade for recruits, a roll for generated players, and a class-year fallback for old saves. Growth scales with the room under that ceiling.
2. **Season stats and awards.**
   - The engine returns full box scores, including faceoffs for the faceoff man and goals allowed for the goalie in net.
   - Each week folds them into `season.playerSeasonStats`. After week 12, `season.awardHistory` names Player, Goalie, Defensive Player, Faceoff Specialist, and Freshman of the Year.
   - A new `/season/leaders` page shows the awards and top-ten tables.
   - To make room, CPU-only games keep three highlights and two top performers in the save. A season's saved state fell from about 3.3 MB to about 2.2 MB.
3. **Fatigue and the late game.**
   - Each side loses up to about 10 rating points by the final horn. Starter stamina sets the pace, a strong second midfield line eases it, and fast tempo, pressure, and a hard ride add to it.
   - In the last five minutes, a team ahead by one to four stalls and a team behind by one to four hurries. In the last two minutes a trailing defense rides harder and fouls more.
4. **Estimate and balance.**
   - The hub estimate plays the exact matchup 160 times through the engine, with fixed seeds.
   - Each side gets a form for the whole game, and the rating-to-result curve is softer, so upsets happen.
   - Tempo was rebalanced so slow is no longer a generally better call.

After Phase 5: 11.9 goals on 38.3 shots per team, 31.2% shooting, and a 51.7% save rate on shots on goal. One-goal games are **19.5%** (was 16–17%), overtime **6.4%**, the median margin **4**, and favorites by 10+ prestige win **81.8%** (was about 88%). The full scheme search's best worst-case edge is +2.0 pp. Against equal teams, slow tempo averages +1.6 pp and fast −2.6 pp.

Original plan:


Player stat lines and season leaders, then awards and All-Americans. Line fatigue and stamina. Clock and game-state behavior. Multi-week injuries. Development that respects potential. Highlights built only from real events. A matchup estimate driven by the engine.

---

### After Phase 5: follow-ups — ✅ done

- **Coaching and installs.** Skill-tree levels give diminishing returns (`treeLevelEdge`: level 5 is worth three levels). Discipline's pull on turnovers is softer (divisor 140 → 200), and the discipline install is trimmed. Conditioning now does something on game day: the ground-ball bonus wins loose-ball chases instead of only padding the box score, and the install takes a quarter off in-game wear. On game day against 30 mid-table opponents, the installs now land at 42.6–45.8% instead of 39.3–49.9%. A regression test holds the spread under 6 pp.
- **Head-to-head.** One top-down pass in `computeRankings` swaps two adjacent teams within 25 points when the lower one won their game.
- **All-Americans.** When the regular season ends, `allAmericanTeams` names first and second teams (3 A, 3 M, 3 D, an LSM, a faceoff man, and a goalie each), shown on the Leaders page.
- **Conference championships.** `src/sim/conferenceTournaments.ts` runs them. The hub adds a "Play the conference championship" step before selection, showing your seed, your semifinal opponent with an estimate and scouting, and a one-line recap after. The Standings page shows each conference's bracket, or the projected top four before it's played. `startPlayoffs` plays the tournaments itself if nobody has. The injury timeline gains two slots for the tournament weeks.

## Design decisions (settled 2026-10-21)

1. **Auto bids:** the 6 highest-ranked conference champions get guaranteed bids, and the other 6 spots are at-large. This is built in Phase 4.
2. **Roster scale:** about 32 generated players, two deep at every position. This is built in Phase 3.
3. **Men's or women's:** men's only through alpha. The women's constants stay in `gameRules.ts`, unused.
4. **CPU rosters:** a small talent record per team, not 127 saved rosters. This is built in Phase 3.

## Audit and polish pass

Fixed in this pass:
- **Transfer portal.** A claimed transfer now joins at the overall the offseason market listed. The market and the turnover step build the board from the same team list.
- **Shot clock.** The game clock no longer runs past 80 seconds on a stalled possession; the violation happens at the clock.
- **Playoffs page.** "Start playoffs" plays the career team's conference championship first, so its fatigue applies the same way as from the hub.
- **Roster page.** Injuries show during conference championship week.
- **Injuries.** A torn ACL in week 1 reads "out for the season" instead of "out 18 weeks".
- **UI polish.**
  - Hub copy for championship week and the wait for selection.
  - The "Projected field" link before the bracket is set.
  - Roster table widths on phones.
  - Standings heading spacing.

Known and left as is:
- A soft reset keeps rivalry trophy holders. No failing case found.
- The Rankings page recomputes the tournament field rather than reading the saved seeds.

## Second audit pass

Fixed:
- **Pro draft.** The draft no longer changes when you finalize the season. It reads the ledger from before that season was added (`season.programLedgerBefore`).
- **Job offers.** Offers are built after the ledger update, so an offered school's tier matches the expectations you get when you accept.
- **Redshirts.** Redshirting a starter promotes the best backup at his position instead of leaving the spot empty.
- **UI.**
  - The hub's last-result card shows a conference championship game when that was your last game.
  - The offseason text no longer repeats itself.
  - The playoff seeds panel and the Top 25 field have more room.
  - The header leaves out the conference place until a game is played.

Known and left as is:
- **Old saves and awards.** A save from before season stats existed names that year's awards from part of the season. This affects one season only.
- **Home field.** The home-field edge uses each program's base prestige, not its earned prestige. Switching it would move every calibration band, so it waits for the next engine tuning pass.

## Third audit pass

Fixed:
- **Preseason recruiting board.** A board built before the first season no longer gets wiped when the season begins.
- **Recruiting page.** Pitch grades, dealbreakers and fit use your current prestige, the same number the recruiting week uses.
- **Board edits after recruiting ends.** Once the last recruiting period has run, the board's Add, hours and pitch controls are disabled.
- **Coach Office after a job change.** A recorded season is judged against the targets and final poll it was played under. These are now saved on the season history entry.
- **Career history.** Year labels run oldest to newest.
- **Fatigue.** The Tactician and Operations reductions only cut fatigue build-up; a Conditioning or rest week recovers in full.
- **Conferences page.** It shows current prestige, matching the team page.
- **Copy.**
  - The Developer card now states its recruiting cost.
  - The empty board no longer says "on the right", which was wrong on phones.
