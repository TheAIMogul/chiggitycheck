import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:5173';
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await p.goto(BASE + '/#1', { waitUntil: 'networkidle0' });
for (let i = 1; i <= 3; i++) {
  await new Promise((r) => setTimeout(r, 900));
  await p.screenshot({ path: `reports/stage/slide-${i}-${W}x${H}.png` });
  await p.keyboard.press('ArrowRight');
}
const m = await b.newPage();
await m.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await m.goto(BASE + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));
await m.screenshot({ path: 'reports/stage/phone-stage.png', fullPage: true });
console.log('overflow phone', await m.evaluate(() => document.documentElement.scrollWidth - innerWidth));
await b.close();
