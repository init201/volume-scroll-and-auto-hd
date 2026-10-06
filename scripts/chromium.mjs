import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const poll = async (task, { attempts = 100, delay = 100, message = 'Timed out' } = {}) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const value = await task().catch(() => undefined);
    if (value) return value;
    await wait(delay);
  }
  throw new Error(message);
};

export const launchChromium = (executable, extraArguments = []) => {
  const profile = mkdtempSync(path.join(tmpdir(), 'vsahd-chromium-'));
  const child = spawn(
    executable,
    [
      '--remote-debugging-pipe',
      `--user-data-dir=${profile}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--mute-audio',
      ...extraArguments,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  const pending = new Map();
  let nextId = 1;
  let buffer = '';

  const failAll = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  child.stdio[4].on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  });
  child.once('error', failAll);
  child.once('exit', () => failAll(new Error('Browser exited unexpectedly')));

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })}\0`);
    });

  const evaluate = async (sessionId, expression) => {
    const { result, exceptionDetails } = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };

  const openPage = async (url) => {
    const { targetId } = await send('Target.createTarget', { url });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    return sessionId;
  };

  const close = async () => {
    await Promise.race([send('Browser.close').catch(() => {}), wait(3000)]);
    child.kill();
    await wait(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  };

  return { send, evaluate, openPage, close };
};
