# Alpha polish: recruiting, prestige, installs, and the Weekly Hub

Audit pass of 2026-10-22. What shipped is listed first; the plan covers what the audit
found and left open.

## Shipped in this pass

### Five-star prestige (`src/sim/prestige.ts`, `src/components/PrestigeStars.tsx`)
- Prestige stays a 1–100 number; stars name it in half steps (5★ at 86+, then every 5 points
  down to 1★ below 51). The base league splits into a pyramid: 7 five-star, 7 one-star programs.
- Tiers: Blue blood (5★), National power (4★+), Established (3★+), Mid-major (2★+), Underdog.
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
- Jobs open where CPU staffs badly missed what their program should win (60% at four or more wins
  short, 30% at three, 10% at two), plus about one in thirty that move on, about ten openings a
  year. Offers only come from open jobs.
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
  and the oldest retire. Hiring opens after the season ends: three candidates per role, and the
  best only take jobs at programs of a certain star rating.

**Postseason awards** (`postseasonAwards.ts`). Each conference names a Player of the Year after week
12; Coach of the Year (wins over expectation plus the bracket run) and the championship's Most
Outstanding Player (semifinal and final) after the title game. Shown on the hub during the postseason
and on the Leaders page.

**Game log.** The engine now records every goal (scorer, assist, man-up, clock, running score) without
drawing from the rng, so results are unchanged. The user's regular-season and playoff games keep it;
the hub shows a line score with overtime columns, lead changes and the biggest leads, the scoring
summary by period, and the game's plays.

### Offseason, depth chart, terminology, and dark mode

**Offseason order.** Signing day, then the portal (it opens once signing day settles the scholarship
count), then End the season, which opens head-coaching jobs and assistant hiring. Begin next season
warns when job offers will lapse or staff seats are empty. The offseason market projects next season's
roster: returning players, signees, transfers in, and the cuts or walk-ons that land it at 32.

Bugs fixed from the review of the untouched code:
- Resetting a season after year 1 regenerated the roster; it now keeps it.
- Recording the season refilled scholarships to 12, so three portal players fit on top of a full class.
- Turnover over the 32-man limit cut new signees and transfers first; returning depth goes first now.
- Walk-ons filled attack first whatever the need; they fill the thinnest positions now.
- An injured goalie or faceoff man was replaced by the best overall backup, not the best specialist.
- The roster and hub showed no injuries between the conference championships and the bracket.
- Signed recruits joined the roster under a different, random name.

**Depth chart.** A board with every starting slot and a pick list per slot (a starter picked elsewhere
trades places), this week's fill-ins for injured starters, and Set best lineup with the rating points the
current lineup leaves on the bench. Position tabs, four sorts, a potential column, and Start that swaps
with the weakest starter when a unit is full.

**Terminology.** One name per thing:

| Use | Not |
|---|---|
| season (the playing year); Year N only for the coach's tenure | next year, new year |
| Coach Office | the office |
| Weekly Hub | the hub (in links and buttons) |
| install | practice focus, practice block |
| base scheme | tactics (in UI copy) |
| offseason market | roster market, coach pool |
| End the season | Record the season, Record the year, Finalize |
| Playoff seeds, the field, the bracket | Tournament seeds |
| conference championship | conference tournament |

**Dark mode.** Settings has System, Light, and Dark; System follows the device. Every color in the
stylesheets reads theme tokens (backgrounds, surfaces, borders, text, and status tints), with a dark
value for each. The header and the coach card stay on the dark brand surface in both themes, and a
saved choice applies before first paint.

### Long-career audit: job security and AD pressure

A 20-season career on staff recruiting at mid-tier programs was fired six times, and coaching
openings climbed from 11 to 26 a year. Causes and fixes:
- AD pressure could only rise. Missed targets added to it at season end, nothing took it back, and
  the weekly booster drift rounded to +1 a week for a coach with low security (about +12 a season,
  whatever the results). Pressure now settles a quarter of the way back toward the program's norm
  each year, wins over the target, a playoff run, and a title ease it, and the weekly drift is small
  and symmetric (about three points a season either way).
- Missing the win target by one game cost 10 security, the same as missing by two. It costs 5 now.
- A poll finish more than ten spots past the rank target cost 8 security even when the win target
  was met. It only applies when the wins also fell short.
- Openings were tuned down (above).

After: three firings in 20 seasons, each after a genuinely bad stretch, a 12-year tenure at one
program, and about ten openings a year.

### Program situations: Rebuild, Stable, Win now

Audit: the three situations were prestige buckets with flat targets (Rebuild 5 wins, Stable 7,
Contender 9) that ignored where a program actually ranks. A bottom rebuild is expected to win 2–4
games and was asked for 5; a mid Stable at par 4–8 was asked for 7. Ten-season careers on staff
recruiting: the rebuild sank every year, and a 9–3 contender was fired.

Now (`src/sim/programExpectations.ts`):
- Situations follow stars: 4½★ and up is **Win now**, 2½★ to 4★ is **Stable**, under 2½★ is
  **Rebuild**. Each has a one-line brief shown at setup, in the Coach Office header, and on job
  listings.
- The win target is the program's par (10 wins for the top program down to 2 for the bottom, the
  scale CPU programs are judged on), rounded down and kept to 3–9. The rank target is the program's
  league rank plus ten.
- Win now: missing the field costs 4 more security. Rebuild: a winning record adds 5.
- A coach who met the win target is never left below the firing line by security alone.

Two causes of the rebuild sinking, both fixed:
- Signees started too far below the rosters they joined, so a low program fell further behind with
  each class. Freshmen now start at 49 + 6 × stars (2★ 61, 5★ 79).
- CPU programs judged their class on total stars against a league-wide line. Most programs under 4★
  sign nobody, so the line pushed the bottom up and the middle down: peers of a rebuild inflated from
  69 to 77 over ten seasons. Classes are judged on average stars, scaled by class size, and a program
  that signed nobody keeps its talent fading toward its rating. Unsigned prospects go to CPU programs
  after signing day (`lateSigningSweep`): the most interested suitor with room, else a regional team.

After (ten seasons, staff recruiting): a Rebuild holds its roster at about 66, wins about its target
of 3, and is never fired. A Stable program climbs from 69 to 75 prestige. A Win now program wins 10
or more in most seasons and is never fired.

**Win now follow-up: titles are the bar.** A win-now program still climbed from 87 to 96 prestige
in ten seasons, because every playoff trip paid like an overachievement. Now, for programs at 4½★ and
up (the user's and the CPU's alike):
- Prestige: a playoff exit before the semifinals earns nothing (was +2); missing the field costs 1
  more than it would elsewhere. A semifinal or final still earns +2, a title +4.
- Security: an early exit is worth +3 (was +10), a semifinal +10, a final +16, a title +25. Only a
  final-four run or a title eases AD pressure.

After (twenty seasons, two win-now programs): 9–3 seasons that miss the field now cost security and
prestige, early prestige wobbles between 82 and 90, and the climb to the top comes from repeat
titles rather than bracket appearances.

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
