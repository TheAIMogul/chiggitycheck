import puppeteer from 'puppeteer-core';
const ts = (process.env.T || '13400').split(',');
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width: Number(process.env.W || 1920), height: Number(process.env.H || 1080), deviceScaleFactor: 1 });
for (const t of ts) {
  await p.goto(`http://localhost:5173/?xpt=${t}#2`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));
  await p.screenshot({ path: `reports/stage/explainer/frozen-${t}.png` });
}
await b.close(); console.log('ok');
