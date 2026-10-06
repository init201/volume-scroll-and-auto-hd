import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PREFERENCES = {
  'devtools.debugger.remote-enabled': true,
  'devtools.chrome.enabled': true,
  'devtools.debugger.prompt-connection': false,
  'browser.shell.checkDefaultBrowser': false,
  'datareporting.policy.dataSubmissionEnabled': false,
  'media.volume_scale': '0.0',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const openSocket = async (port) => {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () => resolve(socket));
        socket.once('error', reject);
      });
    } catch {
      await wait(250);
    }
  }
  throw new Error('Firefox debugger server is not reachable');
};

const createClient = (socket) => {
  const backlog = [];
  const waiters = [];
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const separator = buffer.indexOf(':');
      if (separator === -1) return;
      const end = separator + 1 + Number(buffer.subarray(0, separator).toString());
      if (buffer.length < end) return;
      const packet = JSON.parse(buffer.subarray(separator + 1, end).toString('utf8'));
      buffer = buffer.subarray(end);
      const index = waiters.findIndex((waiter) => waiter.matches(packet));
      if (index === -1) backlog.push(packet);
      else waiters.splice(index, 1)[0].resolve(packet);
    }
  });

  const receive = (matches) =>
    new Promise((resolve) => {
      const index = backlog.findIndex(matches);
      if (index === -1) waiters.push({ matches, resolve });
      else resolve(backlog.splice(index, 1)[0]);
    });

  const request = async (to, type, payload = {}) => {
    const body = Buffer.from(JSON.stringify({ to, type, ...payload }), 'utf8');
    socket.write(Buffer.concat([Buffer.from(`${body.length}:`), body]));
    const reply = await receive((packet) => packet.from === to && !packet.type);
    if (reply.error) throw new Error(`${reply.error}: ${reply.message}`);
    return reply;
  };

  return { receive, request };
};

export const checkFirefox = async ({ executable, extensionPath }) => {
  const profile = mkdtempSync(path.join(tmpdir(), 'vsahd-firefox-'));
  writeFileSync(
    path.join(profile, 'user.js'),
    Object.entries(PREFERENCES)
      .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
      .join('\n'),
  );
  const port = await freePort();
  const child = spawn(
    executable,
    ['-headless', '-no-remote', '-profile', profile, '--start-debugger-server', String(port), 'about:blank'],
    { stdio: 'ignore' },
  );
  child.once('error', () => {});
  let socket;

  try {
    socket = await openSocket(port);
    const { receive, request } = createClient(socket);
    await receive((packet) => packet.from === 'root' && packet.applicationType);
    const root = await request('root', 'getRoot');
    const description = await request(root.deviceActor, 'getDescription').catch(() => null);
    const { addon } = await request(root.addonsActor, 'installTemporaryAddon', {
      addonPath: extensionPath,
      openDevTools: false,
    });
    await wait(500);
    const { addons } = await request('root', 'listAddons');
    const installed = addons.find((entry) => entry.id === addon.id);
    return {
      version: description?.value?.version ?? 'unknown',
      warnings: installed ? (installed.warnings ?? []) : ['Extension is missing after installation'],
    };
  } finally {
    socket?.destroy();
    child.kill();
    await wait(1500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
};
