/**
 * One 20-season career, played the way a scripted coach would, with checks every season:
 * the week advances, rosters stay valid (size, every starting spot, ratings in range and
 * matching each player's traits, unique players), history grows by one a year, and a
 * champion is crowned. Prints one JSON line. Run a batch with scripts/career-batch.mjs.
 *
 *   bun scripts/career-run.ts <label> <low|mid|high> <staff|naive|none> <RECRUITER|TACTICIAN|DEVELOPER> [hopper|aggressive|bold]
 */
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { createHash } from 'node:crypto';
import { leagueReducer } from '../src/features/league/leagueSlice.ts';
import { seasonReducer, startPlayoffs } from '../src/features/season/seasonSlice.ts';
import { settingsReducer } from '../src/features/settings/settingsSlice.ts';
import { exhibitionReducer } from '../src/features/exhibition/exhibitionSlice.ts';
import {
  coachReducer, setCoachProfile, completeCareerSetup, careerSetupFromPrestige, processSigningDay, declineAllJobOffers, setAutoRecruiting,
  upgradeCoachSkill, chooseCoachPerk, acceptJobOffer, addRecruitToBoard, setRecruitHours, setRecruitPitch, setTactics, answerPressConference,
} from '../src/features/coach/coachSlice.ts';
import { beginFirstSeason, runCareerWeeklyCycle, simCareerConferenceChampionships, simCareerPlayoffRound, processSeasonEnd, beginNextCareerSeason, initializeManagedRoster } from '../src/features/coach/careerThunks.ts';
import { COACH_PERKS } from '../src/sim/coachPerks.ts';
import { positionOverall } from '../src/sim/positionRatings.ts';
import { STARTER_SLOTS } from '../src/sim/depthChart.ts';
import { DEFAULT_TACTICS } from '../src/sim/tactics.ts';
import { buildPressConference } from '../src/sim/pressConference.ts';

const [label, tier, recruiting, archetype, twist = ''] = process.argv.slice(2);
const SEASONS = 20;
const store = configureStore({ reducer: combineReducers({ league: leagueReducer, season: seasonReducer, coach: coachReducer, settings: settingsReducer, exhibition: exhibitionReducer }), middleware: (g) => g({ serializableCheck: false, immutableCheck: false }) });
const byPrestige = [...store.getState().league.teams].sort((a, b) => a.prestige - b.prestige || a.id.localeCompare(b.id));
const start = byPrestige[{ low: 10, mid: 64, high: 122 }[tier as 'low' | 'mid' | 'high']];
store.dispatch(setCoachProfile({ name: `Run ${label}`, almaMater: 'U', archetype: archetype as never, age: 38, skill: 72 }));
store.dispatch(completeCareerSetup({ teamId: start.id, seasonYear: 1, ...careerSetupFromPrestige(start.prestige) }));
await store.dispatch(initializeManagedRoster());
if (recruiting === 'staff') store.dispatch(setAutoRecruiting(true));
if (twist === 'aggressive') store.dispatch(setTactics({ ...DEFAULT_TACTICS, tempo: 'fast', defensePackage: 'pressure', rideClear: 'aggressive', midfieldRotation: 'deep' }));
await store.dispatch(beginFirstSeason({ seed: 2026 }));

const problems: string[] = [];
const check = (cond: boolean, msg: string) => { if (!cond && problems.length < 20) problems.push(msg); };
const spend = () => {
  for (let g = 0; g < 40 && store.getState().coach.coachSkillPoints > 0; g++) {
    const t = (['recruiting', 'development', 'operations'] as const).find((k) => store.getState().coach.skillTree[k] < 5);
    if (!t) break;
    store.dispatch(upgradeCoachSkill(t));
  }
  for (const b of ['recruiting', 'development', 'operations'] as const) store.dispatch(chooseCoachPerk({ branch: b, perk: COACH_PERKS[b][0].id }));
};
const naiveWeek = () => {
  const coach = store.getState().coach; if (!coach.recruitPool.length) return;
  const open = coach.recruitPool.filter((r) => !r.committedTeamId).sort((a, b) => b.stars - a.stars || b.potential - a.potential);
  for (const r of open) {
    if (store.getState().coach.boardRecruitIds.length >= 8) break;
    if (store.getState().coach.boardRecruitIds.includes(r.id)) continue;
    store.dispatch(addRecruitToBoard({ recruitId: r.id, startingInterest: 12 + r.stars }));
    store.dispatch(setRecruitPitch({ recruitId: r.id, pitch: r.motivations[0]?.pitch ?? 'PRESTIGE' }));
  }
  const ids = store.getState().coach.boardRecruitIds.filter((id) => { const r = store.getState().coach.recruitPool.find((x) => x.id === id); return r && !r.committedTeamId; });
  for (const id of ids) store.dispatch(setRecruitHours({ recruitId: id, hours: Math.floor(120 / ids.length) }));
};
const checkRoster = (when: string) => {
  const c = store.getState().coach; const roster = c.managedRoster ?? [];
  check(roster.length >= 30 && roster.length <= 34, `${when}: roster size ${roster.length}`);
  const ids = new Set(roster.map((p) => p.id)); check(ids.size === roster.length, `${when}: duplicate player ids`);
  check(new Set(roster.map((p) => p.name)).size === roster.length, `${when}: duplicate names`);
  for (const [pos, n] of Object.entries(STARTER_SLOTS)) check(roster.filter((p) => p.position === pos && !p.redshirt).length >= n, `${when}: only ${roster.filter((p) => p.position === pos).length} ${pos}`);
  for (const p of roster) {
    for (const k of ['shooting', 'passing', 'speed', 'defense', 'IQ', 'stamina', 'discipline', 'overall'] as const) check(Number.isFinite(p[k]) && p[k] >= 40 && p[k] <= 99, `${when}: ${p.name} ${k}=${p[k]}`);
    check(p.overall === positionOverall(p), `${when}: ${p.name} listed ${p.overall}, traits say ${positionOverall(p)}`);
  }
  check(c.starterIds.every((id) => ids.has(id)), `${when}: a starter is not on the roster`);
};

const rows: Array<{ year: number; w: number; l: number; playoff: boolean; title: boolean; note: string }> = [];
let fired = 0, moves = 0; const t0 = performance.now(); const saveSizes: number[] = [];
for (let s = 0; s < SEASONS; s++) {
  const teamId = store.getState().coach.selectedTeamId!;
  checkRoster(`Y${s + 1} start`);
  for (let w = 0; w < 12; w++) {
    if (recruiting === 'naive') naiveWeek();
    const out = await store.dispatch(runCareerWeeklyCycle());
    check(out.payload === 'advanced', `Y${s + 1} W${w + 1}: week did not advance (${String(out.payload)})`);
    spend();
    if (twist === 'bold') {
      const st = store.getState().season;
      const g = st.gameResults.filter((x) => x.teamAId === teamId || x.teamBId === teamId).at(-1);
      if (g) {
        const isA = g.teamAId === teamId; const us = isA ? g.scoreA : g.scoreB, them = isA ? g.scoreB : g.scoreA;
        const key = `${st.year}-w${g.weekIndex}`;
        const pc = buildPressConference({ gameKey: key, won: us > them, userScore: us, oppScore: them, opponentName: 'x', opponentRank: null, streak: 0, recruitingAhead: st.currentWeekIndex < 12 });
        const a = pc.answers[1];
        store.dispatch(answerPressConference({ gameKey: key, tone: a.tone, quote: a.quote, effectLine: a.effectLine, effect: a.effect }));
      }
    }
  }
  const st = store.getState().season; let w = 0, l = 0;
  for (const g of st.gameResults) if (g.teamAId === teamId || g.teamBId === teamId) {
    const us = g.teamAId === teamId ? g.scoreA : g.scoreB, them = g.teamAId === teamId ? g.scoreB : g.scoreA;
    if (us > them) w++; else l++;
  }
  check(w + l === 12, `Y${s + 1}: ${w + l} games`);
  await store.dispatch(simCareerConferenceChampionships()); await store.dispatch(startPlayoffs());
  const playoff = !!store.getState().season.playoffs?.seeds.some((x) => x.teamId === teamId);
  for (let r = 0; r < 4; r++) await store.dispatch(simCareerPlayoffRound());
  const title = store.getState().season.playoffs?.championTeamId === teamId;
  check(!!store.getState().season.playoffs?.championTeamId, `Y${s + 1}: no champion crowned`);
  await store.dispatch(processSigningDay()); await store.dispatch(processSeasonEnd());
  const c = store.getState().coach; let note = '';
  check(c.seasonHistory.length === s + 1, `Y${s + 1}: history has ${c.seasonHistory.length} entries`);
  if (c.employment === 'FIRED') {
    fired++; const landing = c.pendingJobOffers[0]; check(!!landing, `Y${s + 1}: fired with no landing offer`);
    if (landing) { await store.dispatch(acceptJobOffer(landing.teamId)); await store.dispatch(initializeManagedRoster()); moves++; note = `fired -> ${landing.teamId}`; }
  } else if (twist === 'hopper' && c.pendingJobOffers.length) {
    const prestigeOf = (id: string) => store.getState().league.teams.find((t) => t.id === id)!.prestige;
    const best = [...c.pendingJobOffers].sort((a, b) => prestigeOf(b.teamId) - prestigeOf(a.teamId))[0];
    await store.dispatch(acceptJobOffer(best.teamId)); await store.dispatch(initializeManagedRoster()); moves++; note = `took ${best.teamId}`;
  } else if (c.pendingJobOffers.length) store.dispatch(declineAllJobOffers());
  const all = store.getState(); saveSizes.push(JSON.stringify({ s: all.season, c: all.coach, t: all.settings }).length);
  rows.push({ year: st.year, w, l, playoff, title, note });
  if (s < SEASONS - 1) { const next = await store.dispatch(beginNextCareerSeason()); check(typeof next.payload === 'number', `Y${s + 1}: next season did not begin`); }
}
const secs = (performance.now() - t0) / 1000;
const pct = (a: typeof rows) => a.length ? Math.round(100 * a.reduce((x, r) => x + r.w, 0) / a.reduce((x, r) => x + r.w + r.l, 0)) : 0;
const hash = createHash('sha256').update(JSON.stringify(store.getState().coach.seasonHistory)).digest('hex').slice(0, 12);
console.log(JSON.stringify({
  label, start: `${start.schoolName} (${start.prestige})`, recruiting, archetype, twist,
  winPct: { y1_5: pct(rows.slice(0, 5)), y6_10: pct(rows.slice(5, 10)), y11_15: pct(rows.slice(10, 15)), y16_20: pct(rows.slice(15)) },
  playoffs: rows.filter((r) => r.playoff).length, titles: rows.filter((r) => r.title).length, fired, moves,
  notes: rows.filter((r) => r.note).map((r) => `${r.year} ${r.note}`),
  saveMB: { max: +(Math.max(...saveSizes) / 1e6).toFixed(2), last: +(saveSizes.at(-1)! / 1e6).toFixed(2) },
  seconds: Math.round(secs), historyHash: hash, problems,
}));
