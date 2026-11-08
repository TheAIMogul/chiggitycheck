// Asks gpt-5.5 vision where each filled row sits on a real sheet photo. Prints {boxes:[[x,y,w,h]...]} normalized.
// Row tops are reliable; each box ends where the next row starts. Writes <photo>.boxes.json next to the photo.
// usage: node scripts/vision-boxes.mjs <photo.png> <rows>
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const [path, n] = process.argv.slice(2); const nrows = Number(n);
const key = readFileSync(join(homedir(), '.config/openai/chiggitycheck-image-key'), 'utf8').trim();
const b64 = readFileSync(path).toString('base64');
const body = { model: 'gpt-5.5', reasoning: { effort: 'medium' }, input: [{ role: 'user', content: [
  { type: 'input_text', text: `This photo shows a paper attendance table. Rows 1 to ${nrows} contain handwritten names. For each of those rows give the bounding box of the whole table row (from the left edge of the # column to the right edge of the HERE column, from the ruled line above the row to the ruled line below it), in pixel coordinates of this ${'1024x1536'} image: x0, y0 (top), x1, y1 (bottom). Be precise.` },
  { type: 'input_image', image_url: `data:image/png;base64,${b64}`, detail: 'high' }] }],
  text: { format: { type: 'json_schema', name: 'rows', strict: true, schema: { type: 'object', additionalProperties: false, required: ['rows'], properties: { rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['row', 'x0', 'y0', 'x1', 'y1'], properties: { row: { type: 'integer' }, x0: { type: 'number' }, y0: { type: 'number' }, x1: { type: 'number' }, y1: { type: 'number' } } } } } } } } };
const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const j = await res.json(); if (!res.ok) { console.error(JSON.stringify(j).slice(0, 300)); process.exit(1); }
const rows = JSON.parse(j.output.flatMap((o) => o.content || []).find((c) => c.type === 'output_text').text).rows.sort((a, b) => a.row - b.row);
const W = 1024, H = 1536;
const r = rows.slice(0, nrows);
const tops = r.map((x) => x.y0);
const gaps = tops.slice(1).map((t, i) => t - tops[i]).sort((a, b) => a - b);
const g = gaps[Math.floor(gaps.length / 2)];
const med = (a) => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
const x0 = med(r.map((x) => x.x0)), x1 = med(r.map((x) => x.x1));
const boxes = tops.map((t, i) => { const b = i + 1 < tops.length ? tops[i + 1] : t + g; const pad = g * 0.06; return [x0 / W, (t - pad) / H, (x1 - x0) / W, (b - t + 2 * pad) / H].map((v) => Number(v.toFixed(4))); });
writeFileSync(path.replace(/\.png$/, '.boxes.json'), JSON.stringify({ boxes }));
console.log(JSON.stringify({ boxes }));
