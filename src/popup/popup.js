const QUALITY_STEPS = [
  { value: 'medium', label: '360p', tick: '360' },
  { value: 'large', label: '480p', tick: '480' },
  { value: 'hd720', label: '720p', tick: '720' },
  { value: 'hd1080', label: '1080p', tick: '1080' },
  { value: 'hd1440', label: '1440p', tick: '1440' },
  { value: 'hd2160', label: '2160p (4K)', tick: '4K' },
  { value: 'max', label: 'Highest', tick: 'Max' },
];

const extension = globalThis.browser ?? globalThis.chrome;
const storage = extension?.storage?.sync;
const manifest = extension?.runtime?.getManifest?.();
const settings = { ...DEFAULTS };

const checkboxes = document.querySelectorAll('input[type="checkbox"][data-setting]');
const radios = document.querySelectorAll('input[type="radio"]');
const dependents = document.querySelectorAll('[data-depends]');
const stepSlider = document.getElementById('step');
const stepValue = document.getElementById('step-value');
const qualitySlider = document.getElementById('quality');
const qualityTicks = document.getElementById('quality-ticks');

const qualityIndex = () => {
  const index = QUALITY_STEPS.findIndex((step) => step.value === settings.preferredQuality);
  return index === -1 ? QUALITY_STEPS.findIndex((step) => step.value === DEFAULTS.preferredQuality) : index;
};

const setProgress = (slider) => {
  const min = Number(slider.min);
  const max = Number(slider.max);
  slider.style.setProperty('--progress', String((Number(slider.value) - min) / (max - min)));
};

const save = (key, value) => {
  settings[key] = value;
  storage?.set({ [key]: value });
  render();
};

const renderStep = () => {
  stepSlider.value = String(settings.step);
  stepValue.textContent = `${settings.step}%`;
  setProgress(stepSlider);
};

const renderQuality = (index = qualityIndex()) => {
  qualitySlider.value = String(index);
  qualitySlider.setAttribute('aria-valuetext', QUALITY_STEPS[index].label);
  setProgress(qualitySlider);
  for (const [tickIndex, tick] of [...qualityTicks.children].entries()) {
    tick.classList.toggle('is-active', tickIndex === index);
  }
};

const render = () => {
  for (const input of checkboxes) input.checked = Boolean(settings[input.dataset.setting]);
  for (const input of radios) input.checked = String(settings[input.name]) === input.value;
  for (const element of dependents) {
    const active = Boolean(settings[element.dataset.depends]);
    element.classList.toggle('is-off', !active);
    element.inert = !active;
  }
  renderStep();
  renderQuality();
};

const buildQualityTicks = () => {
  qualitySlider.max = String(QUALITY_STEPS.length - 1);
  QUALITY_STEPS.forEach((step, index) => {
    const tick = document.createElement('button');
    tick.type = 'button';
    tick.className = 'tick';
    tick.tabIndex = -1;
    tick.textContent = step.tick;
    tick.style.left = `${(index / (QUALITY_STEPS.length - 1)) * 100}%`;
    tick.addEventListener('click', () => save('preferredQuality', step.value));
    qualityTicks.append(tick);
  });
};

const bindControls = () => {
  for (const input of checkboxes) {
    input.addEventListener('change', () => save(input.dataset.setting, input.checked));
  }

  for (const input of radios) {
    input.addEventListener('change', () => {
      const value = typeof DEFAULTS[input.name] === 'number' ? Number(input.value) : input.value;
      save(input.name, value);
    });
  }

  stepSlider.addEventListener('input', () => {
    settings.step = Number(stepSlider.value);
    renderStep();
  });
  stepSlider.addEventListener('change', () => save('step', Number(stepSlider.value)));

  qualitySlider.addEventListener('input', () => renderQuality(Number(qualitySlider.value)));
  qualitySlider.addEventListener('change', () =>
    save('preferredQuality', QUALITY_STEPS[Number(qualitySlider.value)].value),
  );
};

const renderFooter = () => {
  if (!manifest) return;
  document.getElementById('version').textContent = `v${manifest.version}`;
  if (manifest.homepage_url) {
    const link = document.getElementById('source');
    link.href = manifest.homepage_url;
    link.hidden = false;
  }
};

const finishLoading = () => {
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('is-loading')));
};

buildQualityTicks();
bindControls();
renderFooter();
render();

if (storage) {
  storage.get(DEFAULTS).then((values) => {
    Object.assign(settings, values);
    render();
    finishLoading();
  });
} else {
  finishLoading();
}
