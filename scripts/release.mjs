import { spawnSync } from 'node:child_process';
import { copyFileSync, createReadStream, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, findExecutable } from './browsers.mjs';
import { launchChromium, poll } from './chromium.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const releaseName = `v${manifest.version}`;
const releaseDir = path.join(root, releaseName);
const packageName = `volume-scroll-and-auto-hd-${manifest.version}.zip`;
const skipChecks = process.argv.includes('--skip-checks');

const ASSETS = [
  { name: 'volume', file: 'screenshots/1-volume-1280x800.png', width: 1280, height: 800 },
  { name: 'boost', file: 'screenshots/2-boost-1280x800.png', width: 1280, height: 800 },
  { name: 'quality', file: 'screenshots/3-quality-1280x800.png', width: 1280, height: 800 },
  { name: 'tile', file: 'promo-tile-440x280.png', width: 440, height: 280 },
];

const COPIES = [
  { from: 'store/listing.md', to: 'store-listing.md' },
  { from: 'icons/icon128.png', to: 'store-icon-128.png' },
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const step = (message) => console.log(`\n${message}`);

const quote = (argument) => (/^[\w@./:=-]+$/.test(argument) ? argument : `"${argument.replaceAll('"', '\\"')}"`);

const run = (command, args) => {
  const line = [command, ...args].map(quote).join(' ');
  const result = spawnSync(line, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) throw new Error(`"${line}" failed`);
};

const serveProject = () =>
  new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.join(root, pathname);
      const isFile = file.startsWith(root + path.sep) && statSync(file, { throwIfNoEntry: false })?.isFile();
      if (!isFile) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(response);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

const renderAssets = async () => {
  const executable = BROWSERS.filter((browser) => browser.engine === 'chromium')
    .map(findExecutable)
    .find(Boolean);
  if (!executable) throw new Error('Chrome or Edge is required to render the store assets');

  const server = await serveProject();
  const { port } = server.address();
  const browser = launchChromium(executable);

  try {
    const page = await browser.openPage('about:blank');
    for (const asset of ASSETS) {
      const search = `?asset=${asset.name}`;
      await browser.send(
        'Emulation.setDeviceMetricsOverride',
        { width: asset.width, height: asset.height, deviceScaleFactor: 1, mobile: false },
        page,
      );
      await browser.send('Page.navigate', { url: `http://127.0.0.1:${port}/store/assets.html${search}` }, page);
      await poll(
        () => browser.evaluate(page, `location.search === ${JSON.stringify(search)} && document.body?.dataset.ready === 'true'`),
        { message: `Timed out rendering ${asset.name}` },
      );
      const { data } = await browser.send(
        'Page.captureScreenshot',
        { format: 'png', clip: { x: 0, y: 0, width: asset.width, height: asset.height, scale: 1 } },
        page,
      );
      const output = path.join(releaseDir, asset.file);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, Buffer.from(data, 'base64'));
    }
  } finally {
    await browser.close();
    server.close();
  }
};

const listFiles = (directory, prefix = '') =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );

try {
  console.log(`\nRelease ${manifest.name} ${manifest.version}`);

  if (skipChecks) {
    step('Skipping checks');
  } else {
    step('Running checks');
    run('npm', ['test']);
  }

  step('Building package');
  mkdirSync(releaseDir, { recursive: true });
  run('npx', ['--yes', 'web-ext@10', 'build', '--overwrite-dest', '--artifacts-dir', releaseName, '--filename', packageName]);

  step('Rendering store assets');
  await renderAssets();

  for (const { from, to } of COPIES) copyFileSync(path.join(root, from), path.join(releaseDir, to));

  step(`Release folder ${releaseName}/`);
  for (const file of listFiles(releaseDir).sort()) console.log(`  ${file}`);
  console.log('');
} catch (error) {
  console.error(`\nRelease failed: ${error.message}\n`);
  process.exit(1);
}
