# Alpha polish: recruiting, prestige, installs, and the Weekly Hub

Audit pass of 2026-10-22. What shipped is listed first; the plan covers what the audit
found and left open.

## Shipped in this pass

### Five-star prestige (`src/sim/prestige.ts`, `src/components/PrestigeStars.tsx`)
- Prestige stays a 1–100 number; stars name it in half steps (5★ at 86+, then every 5 points
  down to 1★ below 51). The base league splits into a pyramid: 7 five-star, 7 one-star programs.
- Tiers: Blue blood (5★), National power (4★+), Contender (3★+), Builder (2★+), Rebuild.
- Stars show on the Coach Office (with distance to the next half star and to a drop), team pages,
  the conference browser (now at current prestige, not base), career setup, the job market, the
  recruiting header, and a new Prestige column in career history (`SeasonHistoryEntry.prestigeEnd`).
- Recruiting reads stars: the Prestige and Championship pitch grades come from program stars, and
  every prospect shows how he sees the program (Strong pull / Good fit / Reach / Long shot, from
  `programPull`).
- **Fix:** the user's earned prestige now fades 10% a year like every CPU program
  (`nextPrestigeDrift`, shared by the coach slice, the season-end thunk, and the ledger). Before, the
  user's drift never faded.

### Recruiting
- Academics and campus life are fixed per-school traits (seeded by team id) instead of a prestige
  copy and a flat B+ for all 128 schools, so those pitches mean something.
- The board shows the projected weekly gain and periods to commit for each target, from
  `userWeeklyGain`, the same function the recruiting week runs (minus the ±1 swing).
- Pitch options show your grade and how much the prospect cares about each pitch.
- Dealbreakers name the pitch, the grade, and the 5-point weekly cost.
- Prospect pool: star filter, sort (fit, stars, interest), hide prospects committed elsewhere, and
  an explanation when Add is disabled.
- Hub board hours lock once the recruiting periods are over, as on the full board.

### Installs (game plan)
- Audit found the Offense install was the weakest of the four with fresh legs (it forced fast
  tempo, whose rushed looks cancelled its own edge) and that running Conditioning every week beat
  every rotation. Changes:
  - Offense install no longer forces tempo; it slides late. Tempo is a base-scheme call.
  - Defense install: defense 4 → 5.2, goalie 2.2 → 2.6.
  - Offense and Defense installs cost +5 fatigue a week (were +6 and +7).
  - Conditioning: smaller direct edge (defense 1.4 → 1, faceoff 1.8 → 1.6, ground balls 3.5 → 3).
  - Discipline: penalty avoidance 0.03 → 0.022.
- Result against an even opponent (win %, fresh): Offense 62, Discipline 61, Defense 59,
  Conditioning 57. Over 12 weeks: Offense/Conditioning rotations ~60.5 beat Conditioning every week
  (58.9). New calibration test: each working install outplays a conditioning week with fresh legs.
- Terminology: all four are "X install"; the hub card, desk, and details describe what each actually
  does (Discipline now says its defense gambles less for takeaways, which the engine already did).
  Skill notes name the recruiting tree's faceoff/ground-ball edge.

### Weekly Hub
- The last game shows a box-score strip (shots, saves, ground balls, faceoffs, turnovers, man-up),
  the recap's deciding edge, and four plays from the game.
- New **Around the league** panel (`src/sim/leagueWire.ts`): upsets of ranked teams, ranked
  showdowns, player of the week, the shootout and the rout, poll risers/fallers/drop-outs, your
  conference's scores, next week's ranked games and rivalries, and blue-chip commits from the last
  recruiting period (`RecruitingReport.commits`).

### Recruiting pace (follow-up, approved)
Before: prestige barely mattered. On staff recruiting a 1.5★ program (57) signed 4.0–4.3★ classes
with two to four 5★s, a 5★ program closed 5★s by week 3, and the CPU took only 22 of 90 five-stars
across the test runs. A coach on staff recruiting at a 2.5★ program won 83–92% a year by year six.

Changes (`recruitingWeek.ts`, `autoRecruit.ts`):
- Pitch effects are scaled so the best pitch (A+ on a top motivation) is worth 1.6× instead of
  2.25×. Every grade still counts; a hard cap would have flattened B through A+.
- Program pull reads the star system: an N-star prospect expects an N-star program (expected
  prestige 38 + 10 × stars, the middle of that tier), with a steeper slope (/40) and a 0.35 floor.
- Blue chips decide slower: 8% less weekly gain per star above two.
- Starting interest scales with pull and caps at 35 for a 4★ and 30 for a 5★.
- One hour is worth 0.6 interest instead of 0.5, so programs can sign at their own tier.

After (staff recruiting, three seeds each):

| Program | Avg class | 5★ signed | 5★ commit week |
|---|---|---|---|
| 5★ (90) | 4.0–4.5★ | 2–7 | 4–6 |
| 4.5★ (84) | 4.0–4.2★ | 0–2 | 6–7.5 |
| 3★ (68) | 3.3–3.6★ | 0 | — |
| 1.5★ (57) | 2.3–2.4★ | 0 | — |

The CPU now takes 59 of 90 five-stars. A 2.5★ program on staff recruiting holds its prestige and
wins about half its games over its first five years. The 20-season regression coach (who chases
the highest stars regardless of fit) averages about 36%, close to the ~38% a program at its rank
is expected to win.

### Job offers, staff, awards, and the game log (follow-up)

**Job offers audit.** Before: any strong season (job security 68+) offered the single highest-prestige
program in the league, whether or not it had an opening; the market listed CPU head coaches who were
"hiring" at random, unrelated to the offers; and the listing showed the old coach, not the job.
Now (`jobOffers.ts`):
- Jobs open where CPU staffs badly missed what their program should win (75% at four or more wins
  short), plus about one in twenty that move on. Offers only come from open jobs.
- Reach follows the season: hitting the win target draws one call up to +6 prestige, a playoff run two
  calls up to +11, a title three up to +18. A losing season draws nothing.
- A firing always lands somewhere: the best open seat at or below the old one.
- The office lists head-coaching jobs: stars, conference, region, the targets that come with the job,
  why the seat opened, and an Upgrade / Lateral / Step down tag on offers. Accepting confirms what stays
  behind (commits, assistants, earned prestige).

**Assistant coaches** (`assistants.ts`). Four roles: offensive and defensive coordinators, a recruiting
coordinator, and a strength coach. 60 is neutral; 95 is the ceiling; an empty seat plays at 48.
- Coordinators add up to +1.2 offense or defense (plus shot quality or goalie) and make their install
  hit up to 15% harder. The strength coach cuts fatigue build-up up to 15% and late-game wear; the
  recruiting coordinator moves weekly interest up to 8%.
- Better programs start with better staffs. Each offseason assistants age, young ones improve, the best
  (76+) are hired away as head coaches into the season's openings (more often after a playoff year),
  and the oldest retire. Hiring opens after the season is recorded: three candidates per role, and the
  best only take jobs at programs of a certain star rating.

**Postseason awards** (`postseasonAwards.ts`). Each conference names a Player of the Year after week
12; Coach of the Year (wins over expectation plus the bracket run) and the championship's Most
Outstanding Player (semifinal and final) after the title game. Shown on the hub during the postseason
and on the Leaders page.

**Game log.** The engine now records every goal (scorer, assist, man-up, clock, running score) without
drawing from the rng, so results are unchanged. The user's regular-season and playoff games keep it;
the hub shows a line score with overtime columns, lead changes and the biggest leads, the scoring
summary by period, and the game's plays.

## Open items, in priority order

1. **CPU recruiting reads the same pitches.** CPU pursuit uses prestige and region only; academics
   and campus life now differ by school but only the user benefits. Fold the school traits into
   `cpuWeeklyPursuit`.
2. **Install depth.** Installs are a weekly pick from four. Next step: a second slot (scheme
   install, such as "zone week") that sharpens one base-scheme call against this week's opponent,
   tied to the scouting report.
3. **Prestige consequences.** Stars now drive pitch grades and are shown everywhere. Still to do:
   stars in job-offer tiers (`jobOffers.ts` still compares raw prestige).
4. **Hub wire in the bracket.** The wire covers regular-season weeks and the pause before
   selection. Add conference championship and playoff round results.
5. **Coach of the Year tuning.** A turnaround that missed the field can beat a playoff team; consider
   requiring a winning record or weighting the bracket run more.
6. **Staff contracts.** Assistants have no salary or contract length yet; a staff budget tied to boosters
   would make the elite hires a trade-off.
7. **Responsive pass.** The recruiting target table and the wire panel are dense under 760px.
