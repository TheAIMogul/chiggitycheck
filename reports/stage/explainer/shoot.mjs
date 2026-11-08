// Capture frames of the slide-2 explainer at given loop times (ms after the slide becomes active).
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:5173';
const times = (process.env.T || '1500,2800,4300,5600,7900,9400,11000,12600,13800').split(',').map(Number);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await p.goto(BASE + '/#2', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));
await p.reload({ waitUntil: 'networkidle0' });
const t0 = Date.now();
let last = 0;
for (const t of times.sort((a, b) => a - b)) {
  const wait = t - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await p.screenshot({ path: `reports/stage/explainer/f-${String(t).padStart(5, '0')}.png` });
  last = t;
}
const errs = await p.evaluate(() => (window.__errs || []));
console.log('done', last, errs);
await b.close();
