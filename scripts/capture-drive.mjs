import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__ready, { timeout: 120000 });
await page.evaluate(() => {
  window.__dev.broadMarketGate('golden');
  window.__dev.setMode('drive', true);
  window.__dev.teleport(5, 120, 0);
  window.__dev.setTime('golden', true);
});
await page.evaluate(() => {
  for (let i = 0; i < 120; i++) {
    window.__dev.P.yaw = Math.PI;
    window.__dev.sim(0.05, { KeyW: 1 });
  }
});
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: '/opt/cursor/artifacts/broad-drive-golden.png' });
await browser.close();
