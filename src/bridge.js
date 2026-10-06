const SETTINGS_EVENT = 'vsahd:settings';
const READY_EVENT = 'vsahd:ready';
const extension = globalThis.browser ?? globalThis.chrome;

let currentSettings = null;

const publishSettings = () => {
  if (!currentSettings) return;
  document.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: JSON.stringify(currentSettings) }));
};

const loadSettings = () =>
  extension.storage.sync.get(DEFAULTS).then((values) => {
    currentSettings = values;
    publishSettings();
  });

document.addEventListener(READY_EVENT, publishSettings);

extension.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') loadSettings();
});

loadSettings();
