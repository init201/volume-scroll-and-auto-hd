import { launchChromium, poll } from './chromium.mjs';

export const checkChromium = async ({ executable, extensionPath, scheme = 'chrome' }) => {
  const browser = launchChromium(executable, ['--enable-unsafe-extension-debugging']);

  try {
    const { product } = await browser.send('Browser.getVersion');
    const page = await browser.openPage(`${scheme}://extensions/`);
    await poll(() => browser.evaluate(page, 'typeof chrome.developerPrivate?.getExtensionInfo === "function"'), {
      message: 'Timed out waiting for the extensions page',
    });
    await browser.evaluate(page, 'chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true })');
    const { id } = await browser.send('Extensions.loadUnpacked', { path: extensionPath });
    const info = await poll(() =>
      browser.evaluate(page, `chrome.developerPrivate.getExtensionInfo(${JSON.stringify(id)})`),
    );
    const warnings = [
      ...(info.installWarnings ?? []),
      ...(info.manifestErrors ?? []).map((error) => error.message),
      ...(info.runtimeErrors ?? []).map((error) => error.message),
    ];
    if (info.state !== 'ENABLED') warnings.push(`Extension state is ${info.state}`);
    return { version: product.split('/').pop(), warnings };
  } finally {
    await browser.close();
  }
};
