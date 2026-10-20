/**
 * Production build for https://awest813.github.io/CL26/
 * Copies index.html to 404.html so a refreshed client route still boots the app.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';

const base = '/CL26/';
const build = spawnSync('npx', ['vite', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_PAGES_BASE: base },
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

copyFileSync('dist/index.html', 'dist/404.html');
writeFileSync('dist/.nojekyll', '');
