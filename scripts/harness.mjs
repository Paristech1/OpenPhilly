#!/usr/bin/env node
/**
 * Headless Chromium (SwiftShader) visual harness for Slop Philadelphia.
 * Serves index.html locally, waits for boot, screenshots each time preset.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'test-output', new Date().toISOString().replace(/[:.]/g, '-'));
const PORT = 8765;
const TIMES = ['golden', 'midday', 'blue', 'night'];
const SHOT = {
  pos: [-8, 3, 390],
  look: [0, 112, -59],
  fov: 46,
  q: 'high',
};

function serveStatic() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const file = join(root, path === '/index.html' ? 'index.html' : path.slice(1));
      import('node:fs').then(fs => {
        fs.readFile(file, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          const type = file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': type });
          res.end(data);
        });
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function chromePath() {
  for (const p of ['/usr/local/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p;
  }
  return process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
}

async function waitReady(page, timeoutMs = 120000) {
  await page.waitForFunction(() => window.__ready === true, { timeout: timeoutMs });
}

async function settleFrames(page, n = 8) {
  await page.evaluate(async count => {
    for (let i = 0; i < count; i++) await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, n);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await serveStatic();
  const errors = [];
  const warnings = [];

  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--hide-scrollbars',
      '--window-size=1280,720',
    ],
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(String(e.message || e)));
    page.on('console', msg => {
      const t = msg.type();
      const text = msg.text();
      if (t === 'error') {
        if (/favicon|404.*Not Found/i.test(text) && text.length < 120) return;
        errors.push(text);
      } else if (t === 'warning' && !text.includes('Glow effects unavailable')) warnings.push(text);
    });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 120000 });
    await waitReady(page);
    await settleFrames(page, 12);

    for (const id of TIMES) {
      await page.evaluate(({ id, shot }) => {
        window.__dev.setTime(id, true);
        window.__dev.shot({ ...shot, time: id });
      }, { id, shot: SHOT });
      await settleFrames(page, 10);
      const label = { golden: 'golden-hour', midday: 'midday', blue: 'blue-hour', night: 'night' }[id];
      await page.screenshot({ path: join(outDir, `${label}.png`), type: 'png' });
    }

    await page.evaluate(() => window.__dev.setRain(true, true));
    await page.evaluate(({ shot }) => window.__dev.shot({ ...shot, time: 'night' }), { shot: SHOT });
    await settleFrames(page, 12);
    await page.screenshot({ path: join(outDir, 'night-rain.png'), type: 'png' });

    const stats = await page.evaluate(() => window.__dev.stats());
    const report = {
      ok: errors.length === 0,
      errors,
      warnings,
      screenshots: TIMES.map(id => `${({ golden: 'golden-hour', midday: 'midday', blue: 'blue-hour', night: 'night' })[id]}.png`),
      stats,
      outDir,
    };
    await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
