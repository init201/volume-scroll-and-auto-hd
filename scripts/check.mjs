import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, findExecutable } from './browsers.mjs';
import { checkChromium } from './check-chromium.mjs';
import { checkFirefox } from './check-firefox.mjs';

const TIMEOUT_MS = 90000;
const LABEL_WIDTH = 26;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const runCheck = (browser, executable) =>
  browser.engine === 'firefox'
    ? checkFirefox({ executable, extensionPath: root })
    : checkChromium({ executable, extensionPath: root, scheme: browser.scheme });

const withTimeout = (promise) =>
  Promise.race([
    promise,
    new Promise((resolve, reject) =>
      setTimeout(() => reject(new Error(`No result after ${TIMEOUT_MS / 1000} seconds`)), TIMEOUT_MS).unref(),
    ),
  ]);

const report = (label, status, details = []) => {
  console.log(`  ${label.padEnd(LABEL_WIDTH)}${status}`);
  for (const detail of details) console.log(`    - ${detail}`);
};

const requested = process.argv.slice(2).map((name) => name.toLowerCase());
const selected = requested.length
  ? BROWSERS.filter((browser) => requested.includes(browser.name.toLowerCase()))
  : BROWSERS;

if (!selected.length) {
  console.error(`Unknown browser. Choose from: ${BROWSERS.map((browser) => browser.name.toLowerCase()).join(', ')}`);
  process.exit(1);
}

console.log(`\n${manifest.name} ${manifest.version}\n`);

const totals = { passed: 0, failed: 0, skipped: 0 };

for (const browser of selected) {
  const executable = findExecutable(browser);
  if (!executable) {
    totals.skipped++;
    report(browser.name, `skipped, not installed (set ${browser.variable} to its path)`);
    continue;
  }
  try {
    const { version, warnings } = await withTimeout(runCheck(browser, executable));
    const label = `${browser.name} ${version}`;
    if (warnings.length) {
      totals.failed++;
      report(label, `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`, warnings);
    } else {
      totals.passed++;
      report(label, 'passed');
    }
  } catch (error) {
    totals.failed++;
    report(browser.name, 'failed', [error.message]);
  }
}

console.log(`\n${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped\n`);
process.exit(totals.failed || !totals.passed ? 1 : 0);
