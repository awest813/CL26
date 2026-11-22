/**
 * Ten 20-season careers in parallel, across program strength, recruiting approach, archetype,
 * job moves, tactics, and press answers, plus a replay of one career to check determinism.
 * Prints a table and every integrity problem found; exits non-zero if there are any.
 *
 *   npm run sim:careers        (requires bun on PATH; about a minute)
 */
import { spawn } from 'node:child_process';

const RUNS = [
  ['1', 'low', 'staff', 'RECRUITER'],
  ['2', 'mid', 'staff', 'TACTICIAN'],
  ['3', 'high', 'staff', 'DEVELOPER'],
  ['4', 'low', 'naive', 'DEVELOPER'],
  ['5', 'high', 'naive', 'RECRUITER'],
  ['6', 'mid', 'none', 'TACTICIAN'],
  ['7', 'low', 'staff', 'RECRUITER', 'hopper'],
  ['8', 'high', 'staff', 'TACTICIAN', 'aggressive'],
  ['9', 'mid', 'staff', 'RECRUITER', 'bold'],
  ['2', 'mid', 'staff', 'TACTICIAN'], // replay of run 2
];
const PARALLEL = 5;

function run(args) {
  return new Promise((resolve) => {
    const child = spawn('bun', ['scripts/career-run.ts', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => {
      const line = out.trim().split('\n').at(-1) ?? '';
      try { resolve(JSON.parse(line)); } catch { resolve({ label: args[0], crashed: true, problems: [`exit ${code}: ${(err || out).trim().slice(-400)}`] }); }
    });
  });
}

const results = [];
for (let i = 0; i < RUNS.length; i += PARALLEL) results.push(...await Promise.all(RUNS.slice(i, i + PARALLEL).map(run)));

console.table(results.map((r) => ({
  run: r.label, start: r.start, recruiting: r.recruiting, twist: r.twist || '',
  'win% by 5 yrs': r.winPct ? Object.values(r.winPct).join(' / ') : 'crashed',
  playoffs: r.playoffs, titles: r.titles, fired: r.fired, moves: r.moves, 'save MB': r.saveMB?.max, s: r.seconds,
})));
const original = results[1];
const replay = results.at(-1);
const deterministic = original?.historyHash && original.historyHash === replay?.historyHash;
console.log(`Replay of run 2 is identical: ${deterministic ? 'yes' : 'NO'}`);
const problems = results.flatMap((r) => (r.problems ?? []).map((p) => `run ${r.label}: ${p}`));
console.log(problems.length ? `Problems:\n  ${problems.join('\n  ')}` : 'No integrity problems.');
process.exit(problems.length || !deterministic ? 1 : 0);
