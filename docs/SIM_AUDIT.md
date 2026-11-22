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

### Strategy audit (2026-11-22)

Measured each single call against the schemes the 128 CPU programs actually run (`programTactics`), not just against default, at 8,000–12,000 games a cell. The box score did not move: games without a fast-tempo side replay the same random draws as before.

| Finding | Before | After |
|---|---|---|
| Fast tempo was a trap: every effect it had was a cost (rushed looks, turnovers, wear), and shorter possessions gave both sides the extra trips | −3.3 pp vs the CPU field; −2.8 pp for an underdog; +0.5 pp for a favorite | −0.5 pp vs the field; +0.7 pp for a favorite, −1.4 pp for an underdog. A fast offense now pushes after a clean clear (25% transition chance, 40% of that against a conservative ride), and its settled shot-quality cost is halved. A conservative ride is its counter (−2.1 pp vs −0.7 pp against a balanced ride). |
| Pressure defense beat man against three of four offense sets: its takeaway bonus outweighed the crease's shot-quality edge, so the crease did not beat it as the hint said | +2.8 pp vs the field; vs crease +0.4 pp | −0.3 pp vs the field; vs crease −4.4 pp, vs motion −5.7 pp, vs invert +8.3 pp. Crease vs pressure edge 0.025 → 0.045; pressure takeaway edge 0.022/0.030 → 0.014/0.022 (standard/early slides). |
| Slow tempo stacked a shot-quality bonus (+0.006) on top of fewer possessions and fresher legs, and led the scheme search | +1.0 to +1.6 pp vs the field; best worst case +1.2 pp, average about +2.5 pp | Bonus removed: +0.3 pp in an even matchup, +0.7 pp for an underdog, −0.3 pp for a favorite. It stays the underdog's call through fewer possessions, not better shots. |
| Scheme search, best worst-case edge over default | +1.2 pp | 0.0 pp: default tops the table and no scheme beats it against every opponent. Pressure schemes left the top of the average column (+4–5 pp); slow schemes average about +1.3 pp. |

### Season-level audit (2026-11-22)

Played full seasons through the real store (6–30 seasons) and compared stat leaders, records, and playoffs with D-I, scaled to a 12-game regular season.

| Leader per game | Before | After | Approx. D-I |
|---|---|---|---|
| Faceoff % (top 3) | .56–.60: nobody separated | .61–.68 | .650–.750 |
| Assists | ~2.0 | ~3.0–3.7 | ~3–3.5 |
| Points | ~5.0 | ~6.0–6.7 | ~5.5–6.5 |
| Goals, caused turnovers, save % | 3.8, 2.1, .59–.63 | unchanged | in range |
| Ground balls | ~12.8 (all elite faceoff men) | unchanged | the best faceoff men reach ~13–14 |

- **Faceoffs:** starting specialists are rated 75–93 (p10–p90), and at 0.3 pp per point the best man won about .54 against a median one. A steeper line only punished weak teams. Draw ratings above 85 now count triple (`drawStrength`), so elite men separate while a 50-rated man's team still wins 40%. An elite (95) man is worth about +9 pp of win rate in an even matchup, up from +3 pp. Install, staff, and fatigue modifiers stay linear.
- **Assists:** the assisted-goal rate (56%) was right, but assists spread evenly, because starting attackmen pass alike. Each offense now runs through its strongest feeder, who sets up 20% of its assisted goals outright before the rest are drawn by passing.
- **Install test:** "each working install outplays conditioning" passed on 1,800 games per install, a sample where the 2 pp gap is noise. It now plays 7,200. Install balance did not change (within 0.2 pp at 12,000 games).

Checked and left as designed: **playoff seeding is close to a coin flip among the top 12.** All 12 seeds average 82–84 base prestige, so the field is the twelve best programs, and the poll orders them by 12 games of results between near-equals. #1 seeds won 1 title in 30 seasons. The engine does reward strength: champions are usually in the field's top three by prestige, and favorites win 56% / 63% / 75% / 90% at prestige gaps of 1–4 / 5–9 / 10–19 / 20+. More chalk at the top would take a wider prestige spread among the elite programs in `teams128.json`.

### Position audit (2026-11-22)

- **Overall was the same flat average of seven traits at every position.** A goalie's overall ignored `saving` and a faceoff man's ignored `faceoff`; a defenseman's counted his shooting as much as his defense. Overall picks starters at A, M, D, and LSM for every staff, so in **35–39% of starting slots** it chose a different player than the engine's own position weights would, costing 1.6–1.9 rating points per slot at A, D, and LSM. It is also the OVR the coach reads, so a backup goalie could show a higher OVR than the starter the depth chart (rightly) picked.
  - Now: `positionOverall` (`positionRatings.ts`) weighs traits by what the engine reads at each position, including `faceoff` and `saving`. Starter picks disagree with the engine in 12% of slots (stamina and discipline, which count at team level, make up the rest). A per-position calibration keeps a given overall at the same standing everywhere: generated position means are 74.1–74.4 (faceoff men and goalies sat 1–2 points low before).
  - Used for generated players, recruits, season development, and weekly growth. Saves migrate (persist v4): the coach's roster is re-rated and each player's potential moves with his overall, so his room to grow holds.
- **Transfers had a flat profile:** every trait equal to the listed rating, so a transfer defenseman shot as well as he defended. They now take their position's shape and are listed at their position overall.
- **Specialists never improved in weekly practice:** weekly growth only touched the seven general traits. A faceoff man or goalie picked for growth now also gets work at his specialty.
- Box score and the career harness hold (100-season user win %: 68.7 vs 70.8 before; first 20 seasons 52.9 vs 50.9).
- Production by position was already D-I-like and is unchanged: attack 55% of goals, midfield 42%; close defense 53% of caused turnovers; faceoff men 35% of ground balls.

~~Still open: walk-ons listed 5–8 points below the traits they play with.~~ Resolved below ("Recruiting stakes").

### Against 2026 NCAA D-I (2026-11-22)

Reference: full 2026 team stats for the Big Ten, Big East, and Patriot League (21 teams, 309 team-games), games-weighted, from the conferences' stats pages ([Big Ten](https://bigten.org/stats.aspx?path=mlax&year=2026), [Big East](https://www.bigeast.com/stats.aspx?path=mlax&year=2026), [Patriot League](https://patriotleague.org/stats.aspx?path=mlax&year=2026)). NCAA.com's national tables could not be fetched; national extremes come from its snapshots (best scoring offense 15.64, best scoring defense 7.36). Sim: 6 full league seasons through the real store.

| Per team per game | Sim before | Sim after | 2026 D-I |
|---|---|---|---|
| Goals | 12.6 | 11.1 | 11.3 |
| Shots | 39.5 | 37.4 | 39.2 |
| Shooting % | .318 | .297 | .287 |
| Save % | .510 | .516 | .516 |
| Ground balls | 30.2 | 29.5 | 30.5 |
| Turnovers | 13.8 | 15.9 | 16.0 |
| Caused turnovers | 7.3 | 8.5 | 8.2 |
| Clear % | .868 | .867 | .864 |
| Penalties | 3.6 | 2.8 | 2.5 |
| Man-up chances / conversion | 2.8 / .353 | 2.3 / .329 | 2.5 / .332 |
| Best offense in a season | ~19 | 17.2 | 15.6 |
| Best defense in a season | ~6.3 | 7.5 | 7.4 |

| Leader per game (sim #1) | Before | After | 2026 conference #1s (B1G / BE / PL) |
|---|---|---|---|
| Ground balls | 13.2 | 7.8 | 5.9 / 4.9 / 6.5 |
| Points | 6.2 | 5.7 | 3.8 / 4.8 / 5.4 (2025 national record pace: 6.05) |
| Goals | 4.1 | 3.7 | 2.5 / 3.4 / 3.7 |
| Assists, caused turnovers, faceoff %, save % | in range | in range | 3.4, 2.4, .675, .617 at most |

League checks after: one-goal games 22.8% (was 19.0%), overtime 7.6% (was 5.9%), favorites by 10+ prestige 79.6% (was 82.5%).

Changes (`matchEngine.ts`): on-goal base 0.60 → 0.58 and shooter skill flattened (on-goal 250 → 400, goal 300 → 525 rating points per point), so top programs' shooters no longer run up 18–22 goals a game against weak schedules; goal base 0.45 → 0.46; forced turnovers 0.13 → 0.155 and shot attempts 0.90 → 0.88 (more unforced giveaways); defensive fouls 0.062 → 0.053 and offensive 0.030 → 0.018; faceoff winners' ground balls to the specialist 60% → 35% (wings get the rest, as in a box score); assisted share 0.56 → 0.60. Pressure's takeaway edge was trimmed again (0.014/0.022 → 0.011/0.019) because turnovers decide more games now, and the discipline install's turnover avoidance rose 0.015 → 0.022 for the same reason. Scheme search: best worst case +0.8 pp.

Still open: the best offense in a sim season (~17) runs about 1.5 goals above 2026's best. Diagnosed later the same day: the top five offenses take 47 shots at .340 against a 37-shot, .295 league, from both more possessions (55% of draws, 18.6 forced turnovers vs 15.9) and better looks, all of it the talent gap (prestige 83 vs 67 opponents). Softening how much shot quality buys extra attempts (0.5 → 0.15) moved the best offense only 17.2 → 17.0 while weakening every favorite, so it was not shipped; closing the gap needs a narrower prestige-to-roster slope, which recruiting and career balance are built on.

**Decision (2026-11-22): leave as is.** A narrower slope was measured: `51.3 + 0.31 × prestige` brought the best offense to 16.1 and blowouts (10+) from 11.6% to 8.9%, but a competent 60-season career went from 6 titles to 14 (career win % in seasons 41–60 from 74.5% to 82.5%), because recruits are graded on an absolute star scale while the elite CPU rosters got weaker. Matching the top end that closely would need recruiting retuned alongside it; current difficulty was preferred.

~~Late-career user programs win more (83% vs 75%).~~ Measured before honest walk-ons. Re-measured with the staff recruiting and skill points spent as earned, at a prestige-61 program: 69.0% in seasons 1–20, 74.2% in 21–40, 74.5% in 41–60, 29 playoff trips and 6 titles in 60 seasons, with down years of 42–58%. A program that gets good and stays good without running away; no change needed.

Other lacrosse games: none is a management sim. Casey Powell Lacrosse 18 (Big Ant, 2018) is a console action game with a player-or-coach career mode that reviewers called barebones ([Stevivor](https://stevivor.com/reviews/casey-powell-lacrosse-18-review-take-to-the-field), [Player 2](https://www.player2.net.au/2018/05/casey-powell-lacrosse-18-review/)); Blue Chip Lax is a browser shooting and 3v3 arcade game ([bluechiplax.com](https://bluechiplax.com/)). The nearest genre peers are other sports' college dynasty sims such as Football Coach: College Dynasty.

### Against the Xbox 360 lacrosse games (2026-11-22)

Xbox 360 lacrosse was a handful of $5 Xbox Live Indie Games arcade titles, mostly from Crosse Studios: NLL Lacrosse 2010, NLL 11 (indoor, licensed), and the College Lacrosse series (2011 and 2012 confirmed) ([Video Games Now](https://www.videogamesnow.com/the-best-lacrosse-video-games-4316607/), [Kotaku](https://kotaku.com/licensed-pro-lacrosse-video-game-arrives-for-xbox-360-5523257)). None had critic reviews on Metacritic.

| | NLL 11 | College Lacrosse 2012 | This sim |
|---|---|---|---|
| Genre | Arcade action, indoor | Arcade action, field | Head-coach management |
| Season / career | Franchise mode, league stats | Single-player season | 12-game seasons, conference tournaments, 12-team playoff, multi-decade career |
| Roster control | Manual substitutions | Team editing | Depth chart, redshirts, recruiting, portal, draft |
| Teams | 10 licensed NLL teams, 230 players | College teams | 128 fictional programs |
| Strategy | Play it yourself | Play it yourself | Five scheme calls with counters, weekly installs, scouting |

Sources: [NLL 11 on Metacritic](https://www.metacritic.com/game/nll-11/), [Nexgam review](https://www.nexgam.de/xbox-live-arcade-xbox/nll-2011), [Armless Octopus via N4G](https://n4g.com/news/739871/examiner-nll-11-video-game-preview?info=true), [College Lacrosse 2012 review, Retro Sports Gamer](https://retrosportsgamer.wordpress.com/2012/07/29/college-lacrosse-2012-indie-dev-covers-ignored-sport/), [College Lacrosse 2012 on Metacritic](https://www.metacritic.com/game/college-lacrosse-2012/).

What those games had that this one does not: ~~manual line changes~~ (added as the midfield-lines call; see "Midfield rotation" below), and ~~team editing~~ (added: rename any program and pick its logo letters and colors from its team page) (College Lacrosse 2012; here schools, names, and colors are fixed). Reviewers of both faulted execution and onboarding more than missing modes; the lesson for this sim is to keep explaining its systems in the UI, as the scouting report and install descriptions do.

### Recruiting stakes (2026-11-22)

Walk-ons were listed 5–8 points below the traits they played with, at the program's baseline. That made them free talent: a coach who **never recruited** kept a roster as good as the program's typical player and stayed near .500 indefinitely (8-season probe at a prestige-61 program: 6-6, 8-4, 5-7, 7-5, 6-6, 5-7, 5-7, 2-10, with all 32 players walk-ons by year 5).

Now a walk-on is a step below the program's recruits in every trait and is listed at his position overall. Same probe:

| Recruiting | Years 5–8 | Roster (real overall) |
|---|---|---|
| None | 1-11, 3-9, 0-12, 0-12 | 64 (all walk-ons) |
| Naive: 8-player board of the highest-star prospects | 6-6, 3-9, 2-10, 2-10 | 63, 0–3 signees a year |
| Staff runs recruiting | 8-4, 5-7, 7-5, 5-7 | 71–72, 12 signees a year |

The naive board is the career harness's recruiting routine, so its numbers fell (100-season mean 43.9% vs 74.8%; it passes its assertions). That is the honest result for a board of Reach and Long shot targets, so the harness was left as written; `recruitingStakes.test.ts` now holds the gap between not recruiting and staff recruiting.

So that a player does not fall into it blind, the Weekly Hub's recruiting item now judges the class, not just the effort: from week 6, a class below half of a staff-run pace (2 commits by week 6, 4 by week 10, against a staff pace of 6 by week 5 and 12 by week 10) turns to a warning with the commit count, the weeks left, what open scholarships become, and the two fixes.

### Midfield rotation (2026-11-22)

A sixth game-plan call, **Midfield lines**: ride the starters, balanced (the old behavior and the default; saves without the field play exactly as before), or a deep rotation. It moves only the midfielders' starter and bench weights and how much a second line eases wear (`MIDFIELD_ROTATION` in `matchEngine.ts`). Without a depth chart there are no lines, so the call does nothing. CPU staffs keep balanced lines.

Win % against balanced (6,000–8,000 games each, same matchup, opponent on default):

| Roster / plan | Ride the starters | Deep rotation |
|---|---|---|
| Typical (second line ~2 behind) | -0.3 | +0.1 |
| Second line 6 behind | **+1.6** | -1.1 |
| Second line 12 behind | **+3.3** | -3.4 |
| Lines even | -0.7 | **+1.0** |
| Second line 8 better | -2.1 | **+2.8** |
| Starters' stamina 90 | +0.2 | -1.3 |
| Fast tempo, pressure, hard ride | -0.2 | **+1.7** |

Under the game plan, the Coach Office shows the coach's own lines (first and second line, starters' stamina) and the rotation those numbers favor, with a one-click switch: ride the starters from a 5-point gap; rotate deep with even lines, stamina of 67 or less, or a fast or pressing plan. With depth charts, no rotation combination beats default against every opponent (best worst case -0.3 pp).

### Twenty-season career batch (2026-11-22)

`npm run sim:careers` plays ten 20-season careers (200 seasons) and checks every season: each week advances, rosters stay valid (30–34 players, every starting spot filled, ratings in range and matching each player's traits, no duplicate players), history grows by one a year, and a champion is crowned. A replay of one career must match it exactly. Result: no integrity problems, identical replay, saves steady at ~2.37 MB, 15–21 s a career.

| Start (prestige) | Recruiting | Win % by 5-year block | Playoffs | Titles | Notes |
|---|---|---|---|---|---|
| Harbor City (52) | staff | 27 / 32 / 38 / 32 | 0 | 0 | slow climb |
| Kentucky Bluegrass (68) | staff | 53 / 75 / 88 / 87 | 12 | 4 | dynasty |
| Cascade State (86) | staff | 92 / 85 / 82 / 92 | 19 | 8 | |
| Harbor City (52) | naive | 15 / 28 / 20 / 22 | 0 | 0 | fired 3x |
| Cascade State (86) | naive | 83 / 82 / 87 / 88 | 17 | 4 | |
| Kentucky Bluegrass (68) | none | 48 / 37 / 33 / 32 | 0 | 0 | fired once |
| Harbor City (52) | staff, takes the best job offer | 27 / 37 / 48 / 68 | 2 | 0 | 5 moves |
| Cascade State (86) | staff, fast / pressure / deep lines | 90 / 85 / 87 / 93 | 18 | 8 | |
| Kentucky Bluegrass (68) | staff, bold press answers | 55 / 77 / 92 / 80 | 12 | 4 | |

The weak program is climbing, not stuck: Harbor City starts in one of the strongest conferences (rivals' starters ~79 against a league median of 77) with starters at 69.7. Full staff-signed classes of ~2.3 stars lift its starters to 74.1 and its prestige drift to +6 over 12 years, closing the gap to its conference from 10 points to 4 and reaching a first winning season in year 12. Kentucky Bluegrass starts level with an average conference, wins, recruits 3.5 stars rising to 4.3, and is 6 points above the league by year 10. Prestige, recruiting, and wins feed each other; a weak program in a strong conference turns the loop slowly. A design question, not a bug; left as is.

### National class (2026-11-22)

Recruiting now runs on one national class of 1,700 prospects (`NATIONAL_CLASS_SIZE`) that all 128 programs recruit from. Before, your pool was 180 prospects: most CPU programs signed two or three a year, and their talent faded toward their rating.

- **Who recruits whom.** A prospect's suitors are the 3–5 programs nearest his level (`suitorTargetPrestige`: 55–65 for a two-star, 85–95 for a five-star), moved up by home region and what he wants, with a little noise per staff.
- **Full classes.** A CPU class is full at 12 (`CPU_CLASS_CAP`, also the ledger's full class). In-season commits go mostly to the top half; late signings fill every CPU program to 12 from its suitors first, and about 165 two-stars go unsigned. One seed, after late signings:

| Prestige | Programs | Class | Avg stars | Five-stars |
|---|---|---|---|---|
| 48–57 | 31 | 12 | 2.03 | 0 |
| 58–67 | 32 | 12 | 2.48 | 0 |
| 68–77 | 32 | 12 | 3.12 | 0 |
| 78–85 | 25 | 12 | 3.50 | 23 |
| 86–90 | 7 | 12 | 4.06 | 45 |

- **CPU talent comes from those signings.** Every program now brings in a full class, so the ledger's class edge (stars against programs of the same prestige) moves every CPU roster every year, not just the few that signed someone.
- **Class crowding.** With 68 five-stars in the class, a prestige-86 staff signed twelve of them. Now each prospect of a blue chip's own star rating already committed to you slows him (`classCrowding`: 1 / (1 + 0.15 × count); two- and three-stars do not care). The staff plans for it, and the board shows it ("Crowded class"). The staff's classes, three seeds each: prestige 52 → 2.0–2.1 stars, 68 → 3.0–3.1, 86 → 3.75–3.9 (5★ ×3, 4★ ×3–5).
- **Save size.** The class is 0.61 MB of JSON (signed prospects keep only their school and your interest). An in-season save in year 1 is 3.2 M characters, of which game results and player stats are 2.0 M.
- **Board.** 50 prospects a page, with filters for status (open, committed, all), region, position, and stars. Search finds a prospect, or every prospect headed to a school. A "Top classes so far" list sits on the board. Team pages list the program's commits this year.

The 20-season batch after the change (no integrity problems, identical replay):

| Start (prestige) | Recruiting | Win % by 5-year block | Playoffs | Titles | Before |
|---|---|---|---|---|---|
| Harbor City (52) | staff | 18 / 30 / 62 / 50 | 0 | 0 | 27 / 32 / 38 / 32 |
| Kentucky Bluegrass (68) | staff | 43 / 58 / 70 / 72 | 2 | 0 | 53 / 75 / 88 / 87, 12 playoffs, 4 titles |
| Cascade State (86) | staff | 90 / 90 / 88 / 83 | 18 | 3 | 8 titles |
| Harbor City (52) | naive | 15 / 17 / 33 / 28 | 0 | 0 | 15 / 28 / 20 / 22 |
| Cascade State (86) | naive | 93 / 85 / 90 / 93 | 18 | 5 | 4 titles |
| Kentucky Bluegrass (68) | none | 45 / 40 / 25 / 17 | 0 | 0 | 48 / 37 / 33 / 32 |
| Harbor City (52) | staff, best job offer | 18 / 20 / 57 / 53 | 0 | 0 | 2 playoffs |
| Cascade State (86) | staff, aggressive plan | 90 / 88 / 80 / 97 | 17 | 3 | 8 titles |
| Kentucky Bluegrass (68) | staff, bold answers | 43 / 60 / 78 / 73 | 5 | 0 | 12 playoffs, 4 titles |

The league is harder near the top: CPU programs that sign well now build real rosters. A mid program that recruits well still climbs (43% to 72%), but slower, and the bracket is harder to reach. Not recruiting is punished harder than before.

### Staff audit (2026-11-22)

What a staff is worth, measured: a prestige-77 program against the league, 3,000 games, same rosters, only the four assistants changed. All seats empty (48): 52.8% wins. League average (60): 53.7%. Good (75): 55.0%. Elite (90): 57.0%. About half a win a season from vacant to elite on game day, before recruiting and fatigue.

Fixed:
- **Recruiting coordinator.** He moved weekly interest by ±8% at the extremes, so a league-average hire read "+1%" and the role hardly mattered. Now ±15% for an elite hire, −5% for an empty seat.
- **Strength line.** "+2% late-game wear" meant 2% *less* wear; it now says so, and says nothing when there is no relief.
- **Hiring checks.** The window (before the first season, or between seasons once the year is recorded), the candidate being on this offseason's market, and the program meeting his prestige demand were only enforced by the page. `hireAssistantFromMarket` now checks all three and returns the reason it refused.
- **Losing a specialty.** Replacing an assistant now warns that his specialty goes with him.
- **Head-coach candidates.** Assistants rated 76+ show their chance to leave after a season and after a playoff year (`headCoachPoachChance`), instead of leaving without warning.
- **Specialty reminder.** The hub flags assistants who have earned a specialty and links to the Coach Office. Links to a section of another page (`/career#staff`) now land on it; in-app navigation used to stop at the top.
- **Layout.** The four seats read as a two-by-two (was three and an orphan), downgrades on the market step back, and specialty buttons are left-aligned.

### Coaching carousel (2026-11-22)

Was: CPU head coaches were generated from each season's seed, so every program had a new coach with a new name every year, and an opening never changed anything but the name.

Now (`src/sim/coachingCarousel.ts`, stored as `season.programCoaches`):
- **A coach stays** until he is fired (the opening rules in `programOpenings` are unchanged: a bad miss against the program's expected wins), retires (63+ when he leaves, or on his own from 67), or resigns. His record, titles, age, and seasons at the program are kept.
- **Ratings follow results.** Each year a coach gains or loses up to 2 points on his win difference, 2 more for a title, a point while young and a point back after 60, and settles a tenth of the way toward what a program of that standing usually has. Over 16 seasons the league average moved 70.6 → 72.3, mostly following CPU prestige.
- **Openings fill from the biggest job down.** Candidates: head coaches who won 60%+ last season at a program at least 6 prestige points smaller (after two seasons there), coaches let go elsewhere this offseason (marked down 4), and coordinators ready for a first head job (a notch under the program's usual level). A program can draw a coach up to `52 + prestige × 0.5`. A head coach who moves up opens his seat, which is filled in turn. About 7–15 programs change coaches a year.
- **Your staff in the carousel.** An assistant hired away from your staff becomes that program's head coach (his assistant rating less 4).
- **Jobs that called you** wait for your answer. They, the program you leave, and the one that fires you hire when the next season begins (`fillVacantPrograms`).
- **What a coach is worth.** CPU staffs recruit 0.85× to 1.15× as hard by head coach rating (`coachRecruitingPull`, neutral at 70), and his players gain −0.8 to +0.8 roster rating points a year on the ledger (`coachDevelopmentEdge`). Game day is unchanged, so engine calibration holds.
- **Where to see it.** The Coach Office market lists the carousel: who left (let go, retired, moved on, with his record) and who was hired from where. Team pages show the head coach, his stars, when he was hired, his record there, and his background. Coach of the Year names the real coach. The hub points to the carousel in the offseason.
- **Old saves** need no migration: until a carousel runs, every program shows its original coach, drawn from the program alone.
- **Hot seat.** From week 4 the hub's league wire lists CPU coaches on pace to miss their program's expected wins by two or more (`hotSeat`; "Hot" at four, the miss that sees most of them let go): next offseason's likeliest openings.
- **Scouting** names the opponent's head coach, his stars, and his record there.
- **Coaching tree.** Assistants hired off your staff keep the mark wherever they go next; the Coach Office lists them with their records and titles.
- **Fixed:** dimming downgrade candidates on the staff market with opacity failed color contrast (axe); they now step back with a dashed edge instead.

The 20-season batch checks every season that each CPU program has its own coach, the user's program has none, and ratings stay in range: no problems, identical replay, saves +0.02 MB.

| Start (prestige) | Recruiting | Win % by 5-year block | Playoffs | Titles |
|---|---|---|---|---|
| Harbor City (52) | staff | 25 / 38 / 43 / 55 | 0 | 0 |
| Kentucky Bluegrass (68) | staff | 37 / 67 / 60 / 70 | 1 | 0 |
| Cascade State (86) | staff | 88 / 92 / 83 / 78 | 15 | 7 |
| Harbor City (52) | naive | 15 / 33 / 33 / 22 | 0 | 0 |
| Cascade State (86) | naive | 87 / 90 / 95 / 80 | 15 | 7 |
| Kentucky Bluegrass (68) | none | 48 / 37 / 17 / 42 | 0 | 0 |
| Harbor City (52) | staff, best job offer | 25 / 37 / 50 / 70 | 2 | 1 |
| Cascade State (86) | staff, aggressive plan | 83 / 90 / 85 / 97 | 16 | 8 |
| Kentucky Bluegrass (68) | staff, bold answers | 32 / 47 / 55 / 63 | 0 | 0 |

### Short-stick defensive middies (2026-11-22)

Starters played both ends, so a bench middie who defended far better than a starting scorer never saw the defensive end. Now every staff (CPU and yours) sends its best-defending bench middie on for the starting middie who defends worst, on defense only, when he is at least 2 points better at it (defense 60%, speed 20%, IQ 20%). In his place he counts at the starter's weight in the team defense rating and in who forces turnovers; the starter he replaces counts at the bench's. Offense is unchanged.

- It applies to 96 of 128 generated programs, a median 6 points of midfield defense.
- League calibration barely moved (10.48 → 10.47 goals a team, favorites .796 → .795), since every team gains alike.
- A 95-defense D-middie saves about 0.65 goals a game against the same opponent (600 paired games).
- The Roster page's depth chart names the D-middie and who he runs on for, from this week's available players.

**Fixed with it:** two players on one roster could share a name. Each class's names are unique, but a signee was never checked against the players already there, and the 1,700-prospect class made a clash likely (the career batch caught one in year 9). A newcomer whose name is taken now gets a middle initial ("Nathan R. Egan"), the same one every time; portal additions too.

### Save storage (2026-11-22)

A save peaks mid-season, with the week's results, player stats, and the national class all in it: 3.2 M characters in year 1, growing about 10 K a season to 3.8 M by year 60. localStorage allows about 5 MB, and some browsers count two bytes a character, so a long career could stop saving. The save now lives in IndexedDB (`src/store/saveStorage.ts`), which allows far more and writes without blocking the page; localStorage is the fallback where IndexedDB is unavailable. An old localStorage save moves into IndexedDB on its first load and is then cleared from localStorage. If IndexedDB fails mid-session the save falls back to localStorage and clears the stale IndexedDB copy, so the next load reads the newer one. Checked in the browser: an old save moved over and was cleared, a played week survived a reload, and backup download, reset, and restore all work. A week takes about 350 ms to play and save.

### Rankings transparency (2026-11-22)

The Top 25 page explained the formula, but broke down the score only for No. 1 and your program, in points without the numbers behind them. Now:
- **Any team's score.** Each poll row's points open the score line by line, each with its inputs: record and win % times its weight, capped goal margin, prestige times its fade share ("81 × 0.8 × 40%, fades out by game 10"), the schedule-strength value, and the count of quality wins and bad losses (`rankingScoreLines`).
- **What separates it from the team above**, biggest differences first ("12 points behind No. 4 Zion State. Behind on strength of schedule by 31, ahead on margin by 15", from `rankingGap`). A tie on points says the tiebreaks decide it.
- **Head to head.** A team that moved ahead of the one above it by beating it says so ("Beat Hilltop head to head"); `computeRankings` marks the row (`headToHeadOver`).
- **The bubble.** Outside the projected field, your program sees how many points it trails the last at-large team by, and that a conference title can also get it in.
- **Your program** gets the same line-by-line breakdown, ranked or not.
- **Phones.** Points now show at every width; the trend arrow moves under the rank there, so the poll still fits without sideways scrolling.

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
| D5 | ✅ | **Resolved, measured 2026-11-22:** 60-season careers on staff recruiting no longer run away. Prestige 82 start: 79% / 84% / 86% wins in seasons 1–20 / 21–40 / 41–60, 37 playoffs, 5 titles. Prestige 68: 64% / 70% / 68%, 9 playoffs. Prestige 54: 37% / 55% / 61%, 3 playoffs, 1 title. The national class (every CPU program signs a full class) and CPU head coaches who develop their players closed the rest. Left as a design choice: CPU teams still play without a weekly install or staff modifiers, which are the user's to manage. **Phase 5 measured it and softened it.** Diagnosis: late in a career the user's starters (about 85) are *below* the best CPU programs (about 90), but play an average conference schedule with a maxed coaching tree, in an engine where the better team won too often. Potential-capped growth, game-to-game form, and a softer rating-to-result curve brought late-career seasons from 83–100% wins to mostly 67–92%. After Phase 5, skill-tree levels give diminishing game-day returns (a maxed tree is worth about +9 pp instead of +10, since much of the edge was the install), and the weekly installs were rebalanced to within about 3 pp of each other. The discipline install had been a clear best at +6–10 pp. Original gap: late careers turned into dynasties. In the 100-season harness, the user's program wins 83–100% of its regular-season games from about year 20 on (a 58–83% band before that). The roster stays inside the top-ten band, so the edge comes from the maxed coach skill tree, archetype bonuses, and program resources stacking on game day, not from roster talent. | `coachEffects.ts` `buildCoachGamePlan`; `careerThunks.ts` | Cap the combined game-day modifiers, or make coach skill gains taper. Then add a harness check on late-career win %. |
| D4 | ✅ | **Done (2026-11-22).** The second midfield line matters through rotation relief on fatigue, the coach sets how the lines share the game (Midfield lines call), wings on the draw are the LSM first and the short-stick middies behind him, and every staff now runs a **short-stick defensive middie**: on defense the bench middie who defends best runs on for the starting middie who defends worst, when he is at least 2 points better (`defensiveMiddieSwap`). Was: depth-chart lines; starters were a flat set. | `matchEngine.ts` `calcRatings` | — |

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
