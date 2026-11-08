// Runs vision-lines.mjs for every real sheet photo that has no cached ruled lines yet, three at a time.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(readFileSync(join(ROOT, 'seed/seed.json'), 'utf8'));
const REAL = join(ROOT, 'sheets/real');
const jobs = readdirSync(REAL).filter((f) => /^(s\d+|demo-cg-2026-09-23)\.png$/.test(f)).filter((f) => !existsSync(join(REAL, f.replace('.png', '.lines.json')))).map((f) => {
  const name = f.replace('.png', '');
  const n = name.startsWith('demo') ? seed.demoSheet.rows.length : Math.max(...seed.attendance.filter((a) => `s${a.session_id}` === name).map((a) => a.row_index));
  return [join(REAL, f), n, name];
});
await Promise.all(Array.from({ length: 3 }, async () => { while (jobs.length) { const [p, n, name] = jobs.shift(); try { await run('node', [join(ROOT, 'scripts/vision-lines.mjs'), p, String(n)], { timeout: 300000 }); console.log(name, 'ok'); } catch (e) { console.log(name, 'error', String(e.message).slice(0, 200)); } } }));
