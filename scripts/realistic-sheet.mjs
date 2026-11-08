// Turns a rendered sheet (public/sheets/<name>.jpg) into a realistic, imperfect phone photo with OpenAI gpt-image-2,
// keeping every handwritten name and mark. Writes sheets/real/<name>.png and prints token usage.
// usage: node scripts/realistic-sheet.mjs <name> "<rows description>" [extra direction]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [name, rows, extra = ''] = process.argv.slice(2);
const key = readFileSync(join(homedir(), '.config/openai/chiggitycheck-image-key'), 'utf8').trim();
const src = join(ROOT, 'public/sheets', `${name}.jpg`);
const SCENES = [
  'held on a clipboard in a middle-school hallway under uneven fluorescent light',
  'resting on a scuffed classroom desk next to a pencil, late-afternoon window light from the left',
  'held slightly tilted on a clipboard in a community-center room with warm overhead light',
];
const scene = SCENES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % SCENES.length];

const prompt = `Edit this image into a realistic, slightly imperfect smartphone photo of the SAME paper attendance sheet, ${scene}.
Keep EVERY word of printed and handwritten text EXACTLY as it appears in the reference, in the same rows and order. Do not fix spellings, do not add or remove names, do not add or remove check marks. Rows: ${rows}.
Redraw ALL handwriting as a real person's quick blue ballpoint handwriting, NOT a font: each name written differently, uneven letter sizes and slant, a drifting baseline, some letters joined, a few letters hard to read, one name running slightly over the ruled line. Every check mark is hand-drawn, each a different size and angle, and each sits INSIDE the HERE cell on the SAME row as its name, vertically centred on that name (never between rows). Keep the table grid straight and aligned across the whole width.
Make it look like a real photo a busy program manager took: real ballpoint ink with uneven pressure and a few skips, slightly wrinkled paper with soft folds and corners curling, mild perspective (the sheet tilted a few degrees and the top a bit narrower than the bottom), a soft shadow from the phone across one corner, slightly warm white balance, light phone-camera noise and a hint of softness at the edges. Every handwritten name must stay clearly legible. Portrait, the sheet fills most of the frame. No people, no fingers over text, no extra text. ${extra}`;

const form = new FormData();
form.append('model', 'gpt-image-2');
form.append('prompt', prompt);
form.append('size', '1024x1536');
form.append('quality', 'high');
form.append('n', process.env.N || '1');
form.append('image[]', new Blob([readFileSync(src)], { type: 'image/jpeg' }), `${name}.jpg`);
const t0 = Date.now();
const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
const j = await res.json();
if (!res.ok) { console.error('error', res.status, JSON.stringify(j).slice(0, 400)); process.exit(1); }
mkdirSync(join(ROOT, 'sheets/real'), { recursive: true });
const outs = j.data.map((d, i) => { const out = join(ROOT, 'sheets/real', `${name}${j.data.length > 1 ? '-' + (i + 1) : ''}.png`); writeFileSync(out, Buffer.from(d.b64_json, 'base64')); return out; });
console.log(JSON.stringify({ outs, ms: Date.now() - t0, usage: j.usage }));
