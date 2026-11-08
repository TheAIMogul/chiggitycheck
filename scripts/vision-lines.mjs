// Reads the table's ruled lines off a pixel ruler drawn on the photo (gpt-5.5 vision), at the table's left and right edges.
// Writes <photo>.lines.json: [{k, yl, yr}] for line k = top of row k+1 (k = 0 is the thick rule under NAME), k = 0..rows.
// usage: node scripts/vision-lines.mjs <photo.png> <rows>
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [path, n] = process.argv.slice(2); const rows = Number(n);
const key = readFileSync(join(homedir(), '.config/openai/chiggitycheck-image-key'), 'utf8').trim();
const tmp = join(mkdtempSync(join(ROOT, 'scripts/.ruler-')), 'r.png');
execFileSync('python3', [join(ROOT, 'scripts/ruler.py'), path, tmp]);
const b64 = readFileSync(tmp).toString('base64');
const prompt = `A red pixel ruler is drawn down the left and right margins of this photo (ticks every 10 px, numbers every 50 px). The photo shows a paper attendance table with numbered rows. Line 0 is the thick printed rule directly under the NAME / HERE header. Line k (k = 1..${rows}) is the thin printed rule at the bottom of row k. For each line k = 0..${rows}, read its y position on the ruler where it meets the LEFT edge of the table (yl) and where it meets the RIGHT edge of the table (yr). Read carefully against the tick marks; the paper may be tilted so yl and yr can differ.`;
const body = { model: 'gpt-5.5', reasoning: { effort: 'high' }, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: `data:image/png;base64,${b64}`, detail: 'high' }] }],
  text: { format: { type: 'json_schema', name: 'lines', strict: true, schema: { type: 'object', additionalProperties: false, required: ['lines'], properties: { lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['k', 'yl', 'yr'], properties: { k: { type: 'integer' }, yl: { type: 'number' }, yr: { type: 'number' } } } } } } } } };
const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const j = await res.json(); if (!res.ok) { console.error(JSON.stringify(j).slice(0, 300)); process.exit(1); }
const lines = JSON.parse(j.output.flatMap((o) => o.content || []).find((c) => c.type === 'output_text').text).lines.sort((a, b) => a.k - b.k);
writeFileSync(path.replace(/\.png$/, '.lines.json'), JSON.stringify({ lines }));
console.log(JSON.stringify(lines.map((l) => [l.k, l.yl, l.yr])));
