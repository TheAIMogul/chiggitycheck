// Full-page screenshots of the running app at 1440 and 375 (mobile emulation). Waits for data to load.
// usage: node scripts/shoot.mjs name path [name path ...]
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = 'reports/screens';
const args = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
for (let i = 0; i < args.length; i += 2) {
  const [name, path] = [args[i], args[i + 1]];
  for (const [kind, vp] of [['desktop', { width: 1440, height: 900, deviceScaleFactor: 1 }], ['phone', { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/${kind}-${name}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) console.log(`${kind}-${name}: horizontal overflow ${overflow}px`);
    await page.close();
  }
  process.stdout.write(`${name} `);
}
await browser.close();
console.log('done');
