import { existsSync } from 'node:fs';
import path from 'node:path';

const { env } = process;

const under = (base, ...parts) => (base ? path.join(base, ...parts) : null);

export const BROWSERS = [
  {
    name: 'Chrome',
    engine: 'chromium',
    scheme: 'chrome',
    variable: 'CHROME_PATH',
    paths: {
      win32: [
        under(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        under(env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        under(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ],
      darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
    },
  },
  {
    name: 'Edge',
    engine: 'chromium',
    scheme: 'edge',
    variable: 'EDGE_PATH',
    paths: {
      win32: [
        under(env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        under(env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ],
      darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
      linux: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
    },
  },
  {
    name: 'Firefox',
    engine: 'firefox',
    variable: 'FIREFOX_PATH',
    paths: {
      win32: [
        under(env.PROGRAMFILES, 'Mozilla Firefox', 'firefox.exe'),
        under(env['PROGRAMFILES(X86)'], 'Mozilla Firefox', 'firefox.exe'),
      ],
      darwin: ['/Applications/Firefox.app/Contents/MacOS/firefox'],
      linux: ['/usr/bin/firefox', '/usr/bin/firefox-esr'],
    },
  },
];

export const findExecutable = (browser) =>
  [env[browser.variable], ...(browser.paths[process.platform] ?? [])].find(
    (candidate) => candidate && existsSync(candidate),
  );
