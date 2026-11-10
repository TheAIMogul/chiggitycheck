import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const out = 'reports/early-access';
for (const [kind, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const p = await b.newPage(); await p.setViewport(vp);
  await p.goto('http://localhost:5173/today', { waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 1200));
  await p.click('button[aria-label="Account menu"]'); await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: `${out}/${kind}-menu.png` });
  await p.goto('http://localhost:5173/early-access', { waitUntil: 'networkidle2' });
  await p.type('input[autocomplete="name"]', 'Preview Tester');
  await p.type('input[type="email"]', `preview-${kind}@example.org`);
  await p.type('input[autocomplete="organization"]', 'Preview Org');
  await p.click('button[type="submit"]'); await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: `${out}/${kind}-thanks.png` });
  await p.close();
}
await b.close();
