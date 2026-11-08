// Renders a photo-style JPG for every captured sheet in seed/seed.json plus the live demo sheet.
// Geometry is fixed so each row's bounding box is known exactly (stored back into seed.json).
// Run: node scripts/render-sheets.mjs [--only demo]
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const seed = JSON.parse(readFileSync(join(ROOT, 'seed/seed.json'), 'utf8'));
const OUT = join(ROOT, 'public/sheets');
const TMP = join(ROOT, 'scripts/.render');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

const W = 1200, H = 1600;
const PAPER = { x: 120, y: 150, w: 960, h: 1340 };
const FONTS = { caveat: "'Caveat'", kalam: "'Kalam'", patrick: "'Patrick Hand'", gochi: "'Gochi Hand'", indie: "'Indie Flower'", architects: "'Architects Daughter'" };
const SIZES = { caveat: 40, kalam: 31, patrick: 34, gochi: 33, indie: 32, architects: 28 };
const INK = ['#1b2a6b', '#15181f', '#1d3a8a', '#202024'];

function rng(seedNum) { let a = seedNum >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function rotatePoint(px, py, cx, cy, deg) { const r = (deg * Math.PI) / 180; const dx = px - cx, dy = py - cy; return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)]; }

function sheetHTML({ title, program, site, dateText, facilitator, helper, rows, hand, ink, angle, printedRows, rand }) {
  const rowH = printedRows > 16 ? 44 : 56;
  const top = 380;
  const font = FONTS[hand] || FONTS.caveat;
  const fs = Math.round((SIZES[hand] || 36) * (rowH / 56));
  const checkSvg = (kind) => {
    const j = () => (rand() - 0.5) * 4;
    if (kind === 'present') return `<svg width="54" height="${rowH}" viewBox="0 0 54 56"><path d="M${8 + j()} ${30 + j()} L${20 + j()} ${44 + j()} L${46 + j()} ${10 + j()}" stroke="${ink}" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if (kind === 'unclear') return `<svg width="54" height="${rowH}" viewBox="0 0 54 56"><path d="M${9 + j()} ${29} L${19} ${42} L${25} ${33}" stroke="${ink}" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/></svg>`;
    return '';
  };
  const lines = [];
  for (let i = 0; i < printedRows; i++) {
    const r = rows[i];
    const dx = (rand() - 0.5) * 10, rot = (rand() - 0.5) * 2.2;
    lines.push(`<div class="row" style="top:${top + i * rowH}px;height:${rowH}px">
      <span class="n">${i + 1}</span>
      <span class="name" style="font-size:${fs}px;transform:translate(${dx}px,2px) rotate(${rot}deg)">${r ? r.raw_text : ''}</span>
      <span class="chk">${r ? checkSvg(r.mark) : ''}</span></div>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Kalam&family=Patrick+Hand&family=Gochi+Hand&family=Indie+Flower&family=Architects+Daughter&family=Inter:wght@500;700&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{background:
  radial-gradient(ellipse at 30% 20%, rgba(255,240,215,.25), transparent 55%),
  repeating-linear-gradient(92deg, #6b4a32 0 18px, #74513a 18px 31px, #634330 31px 47px, #7a5640 47px 60px);
  position:relative}
.board{position:absolute;left:${PAPER.x - 46}px;top:${PAPER.y - 70}px;width:${PAPER.w + 92}px;height:${PAPER.h + 120}px;border-radius:26px;
  background:linear-gradient(160deg,#9a6b45,#7d5434 60%,#6d4729);box-shadow:0 30px 60px rgba(0,0,0,.45);transform:rotate(${angle * 0.8}deg)}
.clip{position:absolute;left:50%;top:-34px;width:300px;height:96px;margin-left:-150px;border-radius:14px 14px 22px 22px;
  background:linear-gradient(180deg,#e9ecef,#a9afb6 45%,#d6dade 60%,#8d939a);box-shadow:0 6px 10px rgba(0,0,0,.35);z-index:3}
.paper{position:absolute;left:${PAPER.x}px;top:${PAPER.y}px;width:${PAPER.w}px;height:${PAPER.h}px;background:#fbfaf5;
  box-shadow:0 2px 3px rgba(0,0,0,.18);transform:rotate(${angle}deg);transform-origin:${PAPER.w / 2}px ${PAPER.h / 2}px;
  font-family:Inter,Arial,sans-serif;color:#3a3833}
.org{position:absolute;left:60px;top:84px;font-weight:700;font-size:26px;letter-spacing:.08em}
.ttl{position:absolute;right:60px;top:86px;font-size:22px;color:#66625a}
.field{position:absolute;font-size:19px;color:#55524a}
.field .hw{font-family:${font};font-size:${SIZES[hand] || 36}px;color:${ink};margin-left:12px;position:relative;top:4px}
.field .ln{position:absolute;left:0;right:0;bottom:-6px;border-bottom:1.5px solid #bdb6a7}
.thead{position:absolute;left:60px;right:60px;top:${top - 44}px;height:40px;border-bottom:3px solid #2b2925;font-size:17px;font-weight:700;letter-spacing:.06em;color:#3a3833}
.thead span{position:absolute;bottom:8px}
.row{position:absolute;left:60px;right:60px;border-bottom:1.4px solid #d4cdbd}
.row .n{position:absolute;left:4px;bottom:10px;font-size:15px;color:#9a958a}
.row .name{position:absolute;left:58px;bottom:2px;font-family:${font};color:${ink};white-space:nowrap;transform-origin:left bottom}
.row .chk{position:absolute;right:46px;bottom:-9px}
.vline{position:absolute;top:${top - 44}px;height:${printedRows * rowH + 44}px;border-left:1.4px solid #d4cdbd}
.light{position:absolute;inset:0;background:radial-gradient(ellipse at 25% 15%, rgba(255,255,255,.18), transparent 50%),radial-gradient(ellipse at 90% 100%, rgba(0,0,0,.28), transparent 55%);pointer-events:none}
.grain{position:absolute;inset:0;opacity:.11;mix-blend-mode:multiply;pointer-events:none}
</style></head><body>
<div class="board"><div class="clip"></div></div>
<div class="paper">
  <div class="org">TIDEPATH FAMILY ALLIANCE</div><div class="ttl">${title}</div>
  <div class="field" style="left:60px;top:170px;width:400px">Program:<span class="hw">${program}</span><span class="ln"></span></div>
  <div class="field" style="left:500px;top:170px;width:400px">Site:<span class="hw">${site}</span><span class="ln"></span></div>
  <div class="field" style="left:60px;top:240px;width:400px">Date:<span class="hw">${dateText}</span><span class="ln"></span></div>
  <div class="field" style="left:500px;top:240px;width:400px">Mentor / Facilitator:<span class="hw">${facilitator}</span><span class="ln"></span></div>
  ${helper ? `<div class="field" style="left:60px;top:300px;width:840px;font-size:16px">Parent helper:<span class="hw">${helper}</span></div>` : ''}
  <div class="thead"><span style="left:4px">#</span><span style="left:58px">NAME</span><span style="right:30px">HERE ✓</span></div>
  <div class="vline" style="left:104px"></div><div class="vline" style="right:160px"></div>
  ${lines.join('\n')}
</div>
<div class="light"></div>
<svg class="grain" width="${W}" height="${H}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
</body></html>`;
}

function bboxFor(i, printedRows, angle) {
  const rowH = printedRows > 16 ? 44 : 56;
  const top = 380;
  const local = [[60, top + i * rowH], [PAPER.w - 60, top + i * rowH], [PAPER.w - 60, top + (i + 1) * rowH], [60, top + (i + 1) * rowH]];
  const cx = PAPER.x + PAPER.w / 2, cy = PAPER.y + PAPER.h / 2;
  const pts = local.map(([x, y]) => rotatePoint(PAPER.x + x, PAPER.y + y, cx, cy, angle));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  return [x0 / W, y0 / H, (x1 - x0) / W, (y1 - y0) / H].map((v) => Number(v.toFixed(4)));
}

function render(name, opts) {
  const html = join(TMP, name + '.html');
  const png = join(TMP, name + '.png');
  writeFileSync(html, sheetHTML(opts));
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=6000', `--window-size=${W},${H}`, `--screenshot=${png}`, 'file://' + html], { stdio: 'ignore' });
  const jpg = join(OUT, name + '.jpg');
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', png, '--out', jpg], { stdio: 'ignore' });
  return createHash('sha256').update(readFileSync(jpg)).digest('hex');
}

const mentorById = Object.fromEntries(seed.mentors.map((m) => [m.id, m]));
const mmdd = (d) => { const [y, m, dd] = d.split('-'); return `${Number(m)}/${Number(dd)}/${y.slice(2)}`; };
const progLabel = { mentoring: 'Mentoring', workshop: 'Workshop', counseling: 'Counseling' };
const siteShort = { 'Citrus Grove MS': 'Citrus Grove', 'West Little River CC': 'W. Little River', 'Tidepath office': 'Office' };

let n = 0;
if (!only || only === 'all') {
  for (const s of seed.sessions) {
    if (s.program === 'counseling') continue;
    const rand = rng(s.id * 7919);
    const rows = seed.attendance.filter((a) => a.session_id === s.id).sort((a, b) => a.row_index - b.row_index);
    const fac = mentorById[s.facilitator_mentor_id];
    const angle = Number(((rand() - 0.5) * 3.2).toFixed(2));
    const printedRows = rows.length > 16 ? 22 : 16;
    const name = `s${s.id}`;
    const sha = render(name, { title: s.program === 'workshop' ? `Workshop: ${s.title || ''}` : 'Attendance', program: progLabel[s.program], site: siteShort[s.site], dateText: mmdd(s.held_at), facilitator: fac.full_name.split(' ')[0] + (s.co_lead ? ' + Ana' : ''), helper: s.parent_helper || null, rows, hand: fac.hand, ink: INK[s.id % INK.length], angle, printedRows, rand });
    s.photo_key = `sheets/${name}.jpg`; s.photo_url = `/sheets/${name}.jpg`; s.photo_sha256 = sha; s.angle = angle;
    for (const a of rows) a.bbox = bboxFor(a.row_index - 1, printedRows, angle);
    n++;
    process.stdout.write(`.`);
  }
}
// The live demo sheet (Wed Sep 23, Citrus Grove) in Luis's hand
{
  const d = seed.demoSheet;
  const rand = rng(923);
  const angle = -1.4;
  const sha = render('demo-cg-2026-09-23', { title: 'Attendance', program: 'Mentoring', site: 'Citrus Grove', dateText: '9/23/26', facilitator: 'Luis', helper: null, rows: d.rows, hand: 'caveat', ink: '#1b2a6b', angle, printedRows: 16, rand });
  d.photo_url = '/sheets/demo-cg-2026-09-23.jpg'; d.photo_key = 'sheets/demo-cg-2026-09-23.jpg'; d.photo_sha256 = sha; d.angle = angle;
  d.rows.forEach((r, i) => (r.bbox = bboxFor(i, 16, angle)));
  n++;
}
// Samples on the capture screen: the live sheet + three already-captured sheets (shows duplicate protection)
const findS = (prog, site, date) => seed.sessions.find((s) => s.program === prog && s.site === site && s.held_at === date);
const pickSamples = [
  ['mentoring', 'Citrus Grove MS', '2026-09-16'], ['mentoring', 'West Little River CC', '2026-09-17'], ['workshop', 'West Little River CC', '2026-09-15'],
];
seed.samples = [
  { key: 'cg-2026-09-23', label: 'Citrus Grove · Mentoring', site: 'Citrus Grove MS', program: 'mentoring', held_at: '2026-09-23', time: '4:00 pm', photo_url: seed.demoSheet.photo_url, photo_sha256: seed.demoSheet.photo_sha256, recommended: true, session_id: null },
  ...pickSamples.map(([p, site, date]) => { const s = findS(p, site, date); return { key: `s${s.id}`, label: `${site === 'Citrus Grove MS' ? 'Citrus Grove' : 'West Little River'} · ${progLabel[p]}`, site, program: p, held_at: date, time: s.start_time === '16:00' ? '4:00 pm' : s.start_time === '16:30' ? '4:30 pm' : '6:00 pm', photo_url: s.photo_url, photo_sha256: s.photo_sha256, recommended: false, session_id: s.id }; }),
];
writeFileSync(join(ROOT, 'seed/seed.json'), JSON.stringify(seed, null, 1));
rmSync(TMP, { recursive: true, force: true });
console.log(`\nrendered ${n} sheets`);
