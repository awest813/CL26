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

## Open items, in priority order

1. **Recruiting pace (balance; needs a decision).** A 4★ program closes 5★ "reach" prospects in
   about 3 periods. A HIGH-importance pitch graded A+ multiplies gains by 2.25×, which swamps program
   pull (0.87× for that case). Options: cap the pitch multiplier near 1.6×, or make pull apply after
   the pitch bonus with a steeper curve for star gaps. Check against `autoRecruit.test.ts` and the
   20-season career test, and aim for 5★ reaches taking 6–8 periods.
2. **CPU recruiting reads the same pitches.** CPU pursuit uses prestige and region only; academics
   and campus life now differ by school but only the user benefits. Fold the school traits into
   `cpuWeeklyPursuit`.
3. **Install depth.** Installs are a weekly pick from four. Next step: a second slot (scheme
   install, such as "zone week") that sharpens one base-scheme call against this week's opponent,
   tied to the scouting report.
4. **Prestige consequences.** Stars now drive pitch grades and are shown everywhere. Still to do:
   recruit visits or interest floors gated by stars (a 1★ program cannot start a 5★ above 10%),
   and stars in job-offer tiers (`jobOffers.ts` still compares raw prestige).
5. **Hub wire in the bracket.** The wire covers regular-season weeks and the pause before
   selection. Add conference championship and playoff round results.
6. **Responsive pass.** The recruiting target table and the wire panel are dense under 760px.
