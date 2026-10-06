(() => {
  const SETTINGS_EVENT = 'vsahd:settings';
  const READY_EVENT = 'vsahd:ready';
  const FINE_LIMIT = 10;
  const NOTCH_DELTA = 50;
  const SMOOTH_RESET_MS = 200;
  const INDICATOR_HIDE_MS = 900;
  const QUALITY_RETRY_MS = 250;
  const QUALITY_RETRY_LIMIT = 40;
  const VOLUME_STORE_KEY = 'yt-player-volume';
  const VOLUME_STORE_MS = 30 * 24 * 60 * 60 * 1000;
  const GAIN_SMOOTHING = 0.03;
  const QUIET_START = 0.5;
  const BOOST_COLOR = '#ff4d63';
  const QUALITY_RANK = new Map(
    ['tiny', 'small', 'medium', 'large', 'hd720', 'hd1080', 'hd1440', 'hd2160', 'hd2880', 'highres'].map(
      (quality, index) => [quality, index],
    ),
  );
  const PASSTHROUGH_SELECTOR = [
    '.ytp-settings-menu',
    '.ytp-popup',
    '.ytp-fullscreen-grid',
    'tp-yt-iron-dropdown',
    'tp-yt-paper-dialog',
    'ytd-popup-container',
    'ytmusic-popup-container',
  ].join(',');
  const ICON_PATHS = {
    speaker: 'M4 9.5h3.5L12 5v14l-4.5-4.5H4z',
    near: 'M15.5 9a4 4 0 0 1 0 6',
    far: 'M18 6a8.5 8.5 0 0 1 0 12',
    cross: 'M16 9.5l5 5M21 9.5l-5 5',
  };
  const ICON_STATES = {
    muted: ['speaker', 'cross'],
    silent: ['speaker'],
    low: ['speaker', 'near'],
    high: ['speaker', 'near', 'far'],
  };
  const INDICATOR_STYLES = `
    :host {
      all: initial;
    }
    .pill {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 12px 7px 10px;
      border-radius: 999px;
      background: rgba(15, 15, 17, 0.78);
      color: #fff;
      font: 500 12px/1 Roboto, "YouTube Sans", "Segoe UI", system-ui, sans-serif;
      font-variant-numeric: tabular-nums;
      pointer-events: none;
      opacity: 0;
      transform: translate(-50%, var(--shift, 0)) scale(0.96);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    .pill.center {
      --shift: -50%;
    }
    .pill.visible {
      opacity: 1;
      transform: translate(-50%, var(--shift, 0)) scale(1);
    }
    .pill.boosted {
      color: ${BOOST_COLOR};
    }
    svg {
      width: 16px;
      height: 16px;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .track {
      position: relative;
      width: 84px;
      height: 3px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.22);
      overflow: hidden;
    }
    .fill,
    .boost {
      position: absolute;
      top: 0;
      bottom: 0;
    }
    .fill {
      left: 0;
      background: #fff;
    }
    .boost {
      background: ${BOOST_COLOR};
    }
    .value {
      min-width: 36px;
      text-align: right;
    }
  `;

  const site =
    location.hostname === 'music.youtube.com'
      ? 'music'
      : location.pathname.startsWith('/embed/')
        ? 'embed'
        : 'video';
  const playerSelector = site === 'music' ? '#movie_player' : '#movie_player, #shorts-player';

  let settings = null;

  const wheel = { buffer: 0, timer: 0 };
  const pointer = { rightUsed: false };
  const audio = { context: null, graphs: new WeakMap(), active: false };
  const indicator = { parts: null, timer: 0 };
  const qualityApplied = new WeakMap();
  const qualityRetries = new WeakMap();

  const isEnabled = () =>
    settings !== null &&
    settings.enabled &&
    (site !== 'music' || settings.music) &&
    (site !== 'embed' || settings.embeds);

  const isPlayer = (element) =>
    typeof element?.getVolume === 'function' && typeof element.setVolume === 'function';

  const players = () => [...document.querySelectorAll(playerSelector)].filter(isPlayer);

  const regionOf = (player) => (site === 'music' && player.closest('ytmusic-player')) || player;

  const videoOf = (player) => player.querySelector('video');

  const videoIdOf = (player) => player.getVideoData?.()?.video_id ?? null;

  const isInside = (rect, x, y) =>
    rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

  const playerAt = (event) => {
    if (event.target instanceof Element && event.target.closest(PASSTHROUGH_SELECTOR)) return null;
    return players().find((player) =>
      isInside(regionOf(player).getBoundingClientRect(), event.clientX, event.clientY),
    );
  };

  const boostAllowed = () => isEnabled() && settings.maxVolume > 100;

  const isQuiet = (video) => video.paused || video.muted || video.currentTime < QUIET_START;

  const startAudio = () => {
    if (!audio.context) {
      try {
        audio.context = new AudioContext();
      } catch {
        return null;
      }
      audio.context.addEventListener('statechange', onAudioStateChange);
    }
    if (audio.context.state === 'suspended') audio.context.resume().catch(() => {});
    return audio.context;
  };

  const connectBoost = (video) => {
    const existing = audio.graphs.get(video);
    if (existing) return existing;
    const context = startAudio();
    if (context?.state !== 'running') return null;
    try {
      const gain = context.createGain();
      context.createMediaElementSource(video).connect(gain).connect(context.destination);
      const graph = { gain, factor: 1 };
      audio.graphs.set(video, graph);
      audio.active = true;
      return graph;
    } catch {
      return null;
    }
  };

  const prepareBoost = (video, quiet = isQuiet(video)) => {
    if (!boostAllowed() || audio.graphs.has(video)) return;
    const context = startAudio();
    if (context?.state === 'running' && quiet) connectBoost(video);
  };

  const onAudioStateChange = () => {
    const { state } = audio.context;
    if (state === 'running') {
      for (const player of players()) {
        const video = videoOf(player);
        if (video) prepareBoost(video);
      }
    } else if (state === 'suspended' && audio.active) {
      audio.context.resume().catch(() => {});
    }
  };

  const rampGain = (graph, factor) => {
    graph.factor = factor;
    graph.gain.gain.setTargetAtTime(factor, audio.context.currentTime, GAIN_SMOOTHING);
  };

  const boostOf = (player) => {
    const video = videoOf(player);
    return (video && audio.graphs.get(video)?.factor) || 1;
  };

  const setBoost = (player, factor) => {
    const video = videoOf(player);
    if (!video) return factor <= 1;
    const graph = factor > 1 ? connectBoost(video) : audio.graphs.get(video);
    if (graph) rampGain(graph, factor);
    return Boolean(graph) || factor <= 1;
  };

  const resetBoost = (video, limit = 1) => {
    const graph = audio.graphs.get(video);
    if (graph && graph.factor > limit) rampGain(graph, limit);
  };

  const levelOf = (player) => {
    const volume = Math.round(player.getVolume());
    return volume >= 100 ? Math.round(100 * boostOf(player)) : volume;
  };

  const nextLevel = (level, direction) => {
    const { step, fine, maxVolume } = settings;
    let next;
    if (fine && (direction > 0 ? level < FINE_LIMIT : level <= FINE_LIMIT)) {
      next = level + direction;
    } else if (direction > 0) {
      next = (Math.floor(level / step) + 1) * step;
    } else {
      next = Math.max((Math.ceil(level / step) - 1) * step, fine ? FINE_LIMIT : 0);
    }
    return Math.min(Math.max(maxVolume, 100), Math.max(0, next));
  };

  const storeVolume = (player) => {
    try {
      const now = Date.now();
      const data = JSON.stringify({ volume: Math.round(player.getVolume()), muted: player.isMuted() });
      localStorage.setItem(VOLUME_STORE_KEY, JSON.stringify({ data, expiration: now + VOLUME_STORE_MS, creation: now }));
      sessionStorage.setItem(VOLUME_STORE_KEY, JSON.stringify({ data, creation: now }));
    } catch {}
  };

  const applyLevel = (player, level) => {
    player.setVolume(Math.min(level, 100));
    if (level > 0 && player.isMuted()) player.unMute();
    return setBoost(player, level > 100 ? level / 100 : 1) ? level : 100;
  };

  const svgElement = (name, attributes = {}) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };

  const htmlElement = (name, className) => {
    const element = document.createElement(name);
    element.className = className;
    return element;
  };

  const createIndicator = () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(INDICATOR_STYLES);
    root.adoptedStyleSheets = [sheet];

    const pill = htmlElement('div', 'pill');
    const icon = svgElement('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    const paths = {};
    for (const [name, d] of Object.entries(ICON_PATHS)) {
      paths[name] = svgElement('path', { d });
      icon.append(paths[name]);
    }
    const track = htmlElement('div', 'track');
    const fill = htmlElement('div', 'fill');
    const boost = htmlElement('div', 'boost');
    const value = htmlElement('span', 'value');
    track.append(fill, boost);
    pill.append(icon, track, value);
    root.append(pill);
    return { host, pill, paths, fill, boost, value };
  };

  const showIndicator = (player, level, muted = false) => {
    if (settings.indicator === 'off') return;
    indicator.parts ??= createIndicator();
    const { host, pill, paths, fill, boost, value } = indicator.parts;
    const container = document.fullscreenElement ?? document.body ?? document.documentElement;
    if (host.parentNode !== container) container.append(host);

    const scale = Math.max(settings.maxVolume, 100);
    const base = muted ? 0 : Math.min(level, 100);
    const extra = muted ? 0 : Math.max(level - 100, 0);
    fill.style.width = `${(base / scale) * 100}%`;
    boost.style.left = `${(base / scale) * 100}%`;
    boost.style.width = `${(extra / scale) * 100}%`;
    value.textContent = muted ? 'Muted' : `${level}%`;

    const state = muted ? 'muted' : level === 0 ? 'silent' : level < 50 ? 'low' : 'high';
    for (const [name, path] of Object.entries(paths)) {
      path.style.display = ICON_STATES[state].includes(name) ? '' : 'none';
    }

    const centered = settings.indicator === 'center';
    const rect = regionOf(player).getBoundingClientRect();
    pill.classList.toggle('boosted', extra > 0);
    pill.classList.toggle('center', centered);
    pill.style.left = `${rect.left + rect.width / 2}px`;
    pill.style.top = centered
      ? `${rect.top + rect.height / 2}px`
      : `${rect.top + Math.max(12, Math.min(28, rect.height * 0.06))}px`;
    pill.classList.add('visible');

    clearTimeout(indicator.timer);
    indicator.timer = setTimeout(() => pill.classList.remove('visible'), INDICATOR_HIDE_MS);
  };

  const changeVolume = (player, direction) => {
    if (player.isMuted()) {
      if (direction < 0) return showIndicator(player, 0, true);
      player.unMute();
      if (player.getVolume() > 0) {
        storeVolume(player);
        return showIndicator(player, levelOf(player));
      }
    }
    const level = applyLevel(player, nextLevel(levelOf(player), direction));
    storeVolume(player);
    showIndicator(player, level);
  };

  const toggleMute = (player) => {
    if (player.isMuted()) {
      player.unMute();
      showIndicator(player, levelOf(player));
    } else {
      player.mute();
      showIndicator(player, 0, true);
    }
    storeVolume(player);
  };

  const wheelDirection = (event) => {
    const mode = event.deltaMode;
    const delta = event.deltaY || (event.shiftKey ? event.deltaX : 0);
    if (!delta) return 0;
    if (mode !== WheelEvent.DOM_DELTA_PIXEL || Math.abs(delta) >= NOTCH_DELTA) {
      wheel.buffer = 0;
      return -Math.sign(delta);
    }
    wheel.buffer += delta;
    clearTimeout(wheel.timer);
    wheel.timer = setTimeout(() => {
      wheel.buffer = 0;
    }, SMOOTH_RESET_MS);
    if (Math.abs(wheel.buffer) < NOTCH_DELTA) return 0;
    const direction = -Math.sign(wheel.buffer);
    wheel.buffer = 0;
    return direction;
  };

  const modifierActive = (event) => {
    if (settings.modifier === 'shift') return event.shiftKey;
    if (settings.modifier === 'right') return (event.buttons & 2) !== 0;
    return true;
  };

  const onWheel = (event) => {
    if (!isEnabled() || !settings.wheel || event.ctrlKey || event.metaKey || !modifierActive(event)) return;
    const player = playerAt(event);
    if (!player) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (settings.modifier === 'right') pointer.rightUsed = true;
    const direction = wheelDirection(event);
    if (direction) changeVolume(player, direction);
  };

  const onMouseDown = (event) => {
    if (event.button === 2) pointer.rightUsed = false;
    if (event.button !== 1 || !isEnabled() || !settings.middleClick) return;
    if (event.target instanceof Element && event.target.closest('a[href]')) return;
    const player = playerAt(event);
    if (!player) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleMute(player);
  };

  const onContextMenu = (event) => {
    if (!pointer.rightUsed) return;
    pointer.rightUsed = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const pickQuality = (available, preferred) => {
    const ranked = available
      .filter((quality) => QUALITY_RANK.has(quality))
      .sort((a, b) => QUALITY_RANK.get(b) - QUALITY_RANK.get(a));
    if (!ranked.length) return null;
    if (preferred === 'max') return ranked[0];
    const limit = QUALITY_RANK.get(preferred) ?? QUALITY_RANK.get('hd1080');
    return ranked.find((quality) => QUALITY_RANK.get(quality) <= limit) ?? ranked[ranked.length - 1];
  };

  const applyQuality = (player, attempt = 0) => {
    clearTimeout(qualityRetries.get(player));
    if (!isEnabled() || !settings.quality || typeof player.getAvailableQualityLevels !== 'function') return;
    if (player.classList.contains('ad-showing')) return;

    const videoId = videoIdOf(player);
    const preferred = settings.preferredQuality;
    const applied = qualityApplied.get(player);
    if (applied?.videoId === videoId && applied.preferred === preferred) return;

    const target = videoId && pickQuality(player.getAvailableQualityLevels(), preferred);
    if (!target) {
      if (attempt < QUALITY_RETRY_LIMIT) {
        qualityRetries.set(player, setTimeout(() => applyQuality(player, attempt + 1), QUALITY_RETRY_MS));
      }
      return;
    }

    player.setPlaybackQualityRange?.(target, target);
    player.setPlaybackQuality?.(target);
    qualityApplied.set(player, { videoId, preferred });
  };

  const onMediaEvent = (event) => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    const player = video.closest(playerSelector);
    if (!isPlayer(player)) return;

    switch (event.type) {
      case 'loadstart':
        resetBoost(video);
        prepareBoost(video, true);
        break;
      case 'play':
        prepareBoost(video, true);
        break;
      case 'pause':
        prepareBoost(video);
        break;
      case 'volumechange':
        if (player.getVolume() < 100) resetBoost(video);
        break;
      default:
        applyQuality(player);
    }
  };

  const onUserGesture = () => {
    if (boostAllowed() && audio.context?.state !== 'running' && players().length) startAudio();
  };

  const onSettings = (event) => {
    try {
      settings = JSON.parse(event.detail);
    } catch {
      return;
    }
    const boostLimit = isEnabled() ? Math.max(settings.maxVolume, 100) / 100 : 1;
    for (const player of players()) {
      const video = videoOf(player);
      if (video) {
        resetBoost(video, boostLimit);
        prepareBoost(video);
      }
      applyQuality(player);
    }
  };

  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('pointerdown', onUserGesture, true);
  window.addEventListener('keydown', onUserGesture, true);
  for (const type of ['loadstart', 'loadedmetadata', 'play', 'playing', 'pause', 'volumechange']) {
    document.addEventListener(type, onMediaEvent, true);
  }
  document.addEventListener(SETTINGS_EVENT, onSettings);
  document.dispatchEvent(new CustomEvent(READY_EVENT));
})();
