#!/usr/bin/env node
/**
 * Broad/Market visual fidelity gate — run against a local or deployed build.
 * Usage: node scripts/fidelity-gate.mjs [url]
 * Example: python3 -m http.server 8765 & node scripts/fidelity-gate.mjs http://127.0.0.1:8765/index.html
 */
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const chrome = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: chrome,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__ready, { timeout: 120000 });

const golden = await page.evaluate(() => window.__dev.broadMarketGate('golden'));
const night = await page.evaluate(() => window.__dev.broadMarketGate('night'));

await browser.close();

const ok = errors.length === 0 && golden.ok && night.ok;
console.log(JSON.stringify({ ok, errors, golden, night }, null, 2));
process.exit(ok ? 0 : 1);
