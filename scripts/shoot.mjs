// Headless verification: load the app, capture console/errors, screenshot.
// Usage: node scripts/shoot.mjs [url] [outfile] [waitMs]
//   node scripts/shoot.mjs                     -> http://localhost:8001, shot.png, 1500ms
//   node scripts/shoot.mjs http://localhost:8001 out.png 3000
//
// Exit code is non-zero if any page/console error was seen, so it can gate CI.
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8001/';
const out = process.argv[3] || 'shot.png';
const waitMs = Number(process.argv[4] || 1500);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
const logs = [];
page.on('console', (msg) => {
  const t = msg.type();
  logs.push(`[${t}] ${msg.text()}`);
  if (t === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => {
  errors.push(`goto failed: ${e.message}`);
});

// Give the WebGL/physics loop time to spin up and render a few frames.
await page.waitForTimeout(waitMs);

await page.screenshot({ path: out });
await browser.close();

console.log(`\n=== console (${logs.length}) ===`);
for (const l of logs) console.log(l);

if (errors.length) {
  console.log(`\n=== ERRORS (${errors.length}) ===`);
  for (const e of errors) console.log(e);
  console.log(`\nScreenshot: ${out}`);
  process.exit(1);
}
console.log(`\nNo errors. Screenshot: ${out}`);
