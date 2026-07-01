import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AudioManager,
  type AudioConfig,
  type AudioSourceType,
  type WeatherAmbience,
} from './audio/AudioManager';
import { VisualManager } from './visual/VisualManager';

const audioManager = new AudioManager();
let visualManager: VisualManager | null = null;
let startupWeather: StartupWeather | null = null;
let audioConfig: AudioConfig = {
  sourceType: 'weather',
  customWeatherParam: '',
};

type StartupWeather = {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  temperatureC: number;
  weatherCode: number;
  isDay: boolean;
  windSpeedMps: number;
  ambience: WeatherAmbience;
  source: string;
  locationSource: string;
};

function createUI() {
  const app = document.getElementById('app') as HTMLDivElement;
  app.innerHTML = `
    <style>
      :root {
        --energy-intensity: 0;
        --energy-glow-alpha: 0.28;
        --energy-glow-color: rgba(120, 190, 255, 0.45);
        --panel-border: rgba(255, 255, 255, 0.08);
        --panel-highlight: rgba(255, 255, 255, 0.16);
      }

      * {
        box-sizing: border-box;
      }

      body {
        font-family: Inter, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
        color: rgba(255, 255, 255, 0.92);
      }

      #visualContainer canvas {
        display: block;
      }

      #uiOverlay {
        position: fixed;
        inset: 0;
        z-index: 10;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        opacity: 0;
        transition: opacity 0.5s ease;
      }

      .fs-hud {
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 14;
        pointer-events: auto;
      }

      .fs-settings-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 46px;
        height: 46px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.4);
        font-size: 1.15rem;
        cursor: pointer;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
        transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .fs-settings-button:hover {
        color: rgba(255, 255, 255, 0.88);
        background: rgba(255, 255, 255, 0.14);
        transform: translateY(-1px);
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.28), 0 0 24px rgba(0, 240, 255, 0.14);
      }

      .fs-settings-button:focus-visible {
        outline: 2px solid rgba(0, 240, 255, 0.4);
        outline-offset: 4px;
      }

      .fs-panel {
        position: relative;
        width: min(520px, calc(100vw - 48px));
        padding: 40px 60px;
        border-radius: 24px;
        border: 1px solid var(--panel-border);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.018)),
          rgba(255, 255, 255, 0.03);
        backdrop-filter: blur(20px) saturate(135%);
        -webkit-backdrop-filter: blur(20px) saturate(135%);
        box-shadow:
          0 30px 80px rgba(0, 0, 0, 0.42),
          inset 0 1px 0 rgba(255, 255, 255, 0.08),
          0 0 60px rgba(0, 240, 255, calc(var(--energy-intensity) * 0.08));
        overflow: hidden;
      }

      .fs-panel::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02) 35%, rgba(255, 255, 255, 0) 60%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0));
        opacity: 0.9;
        pointer-events: none;
      }

      .fs-panel::after {
        content: "";
        position: absolute;
        inset: 1px;
        border-radius: 23px;
        border: 1px solid rgba(255, 255, 255, 0.03);
        pointer-events: none;
      }

      .fs-panel-content {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        text-align: center;
      }

      .fs-title {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 300;
        letter-spacing: 4px;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.6);
        text-shadow: 0 0 20px rgba(255, 255, 255, 0.08);
      }

      .fs-energy {
        margin: 2px 0 0;
        font-size: clamp(5rem, 10vw, 6rem);
        line-height: 0.94;
        font-weight: 800;
        letter-spacing: -0.06em;
        color: rgba(248, 251, 255, 0.98);
        text-shadow:
          0 0 16px rgba(255, 255, 255, 0.22),
          0 0 30px var(--energy-glow-color),
          0 0 64px rgba(0, 240, 255, calc(var(--energy-glow-alpha) + var(--energy-intensity) * 0.28)),
          0 0 110px rgba(0, 240, 255, calc(var(--energy-intensity) * 0.22));
        transition:
          text-shadow 0.18s ease-out,
          transform 0.18s ease-out,
          color 0.18s ease-out;
      }

      .fs-subtitle {
        margin: 0;
        font-size: 0.94rem;
        font-weight: 500;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.38);
      }

      .fs-divider {
        width: 76px;
        height: 1px;
        margin: 6px 0 2px;
        background: linear-gradient(90deg, rgba(255, 255, 255, 0), var(--panel-highlight), rgba(255, 255, 255, 0));
      }

      .fs-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.78rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.28);
      }

      .fs-meta-dot {
        width: 4px;
        height: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.24);
        box-shadow: 0 0 12px rgba(0, 240, 255, 0.18);
      }

      .fs-audio-status {
        margin-top: -2px;
        font-size: 0.8rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.38);
      }

      #audioBtnContainer {
        margin-top: 10px;
        pointer-events: auto;
      }

      .fs-audio-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-width: 176px;
        padding: 12px 32px;
        border: none;
        border-radius: 50px;
        background: rgba(255, 255, 255, 0.9);
        color: #0a0b10;
        font-family: inherit;
        font-size: 0.98rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow:
          0 10px 30px rgba(255, 255, 255, 0.18),
          0 0 24px rgba(0, 240, 255, 0.18);
      }

      .fs-audio-button:hover {
        transform: scale(1.05);
        background: rgba(255, 255, 255, 0.96);
        box-shadow:
          0 14px 36px rgba(255, 255, 255, 0.18),
          0 0 36px rgba(0, 240, 255, 0.28);
      }

      .fs-audio-button:active {
        transform: scale(1.02);
      }

      .fs-audio-button:focus-visible {
        outline: 2px solid rgba(0, 240, 255, 0.45);
        outline-offset: 4px;
      }

      .fs-audio-icon {
        font-size: 1rem;
        filter: saturate(0) brightness(0.2);
      }

      .fs-settings-backdrop {
        position: fixed;
        inset: 0;
        z-index: 18;
        background: rgba(3, 5, 10, 0.28);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .fs-settings-backdrop.is-open {
        opacity: 1;
        pointer-events: auto;
      }

      .fs-settings-panel {
        position: fixed;
        top: 0;
        right: 0;
        width: min(420px, calc(100vw - 20px));
        height: 100vh;
        z-index: 20;
        padding: 28px 24px 24px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        border-left: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(10, 11, 16, 0.5);
        backdrop-filter: blur(25px) saturate(125%);
        -webkit-backdrop-filter: blur(25px) saturate(125%);
        box-shadow: -24px 0 60px rgba(0, 0, 0, 0.28);
        transform: translateX(100%);
        transition: transform 0.34s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: auto;
      }

      .fs-settings-panel::-webkit-scrollbar {
        width: 8px;
      }

      .fs-settings-panel::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.03);
      }

      .fs-settings-panel::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.14);
      }

      .fs-settings-panel::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.22);
      }

      .fs-settings-panel.is-open {
        transform: translateX(0);
      }

      .fs-settings-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .fs-settings-heading {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 500;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.86);
      }

      .fs-settings-close {
        width: 38px;
        height: 38px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.74);
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.25s ease;
      }

      .fs-settings-close:hover {
        background: rgba(255, 255, 255, 0.12);
        color: rgba(255, 255, 255, 0.96);
      }

      .fs-settings-copy {
        margin: 0;
        font-size: 0.9rem;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.5);
      }

      .fs-settings-section {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 18px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.03);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
      }

      .fs-settings-section-title {
        margin: 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
      }

      .fs-settings-section-hint {
        margin: -4px 0 0;
        font-size: 0.84rem;
        line-height: 1.55;
        color: rgba(255, 255, 255, 0.46);
      }

      .fs-radio-list {
        display: grid;
        gap: 12px;
      }

      .fs-radio-option {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 14px 14px 14px 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.03);
        transition: all 0.24s ease;
        cursor: pointer;
      }

      .fs-radio-option:hover {
        border-color: rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.05);
      }

      .fs-radio-option input {
        margin-top: 2px;
        accent-color: #8ff7ff;
      }

      .fs-radio-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .fs-radio-label {
        font-size: 0.93rem;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.92);
      }

      .fs-radio-description {
        font-size: 0.82rem;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.48);
      }

      .fs-field {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .fs-label {
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.42);
      }

      .fs-input {
        width: 100%;
        padding: 14px 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.92);
        font: inherit;
        outline: none;
        transition: all 0.24s ease;
      }

      .fs-input::placeholder {
        color: rgba(255, 255, 255, 0.28);
      }

      .fs-input:focus {
        border-color: rgba(0, 240, 255, 0.28);
        box-shadow: 0 0 0 4px rgba(0, 240, 255, 0.08);
      }

      .fs-input:disabled {
        opacity: 0.42;
        cursor: not-allowed;
      }

      .fs-settings-footer {
        margin-top: auto;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }

      .fs-button-secondary,
      .fs-button-primary {
        border: none;
        border-radius: 999px;
        padding: 12px 20px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .fs-button-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.82);
      }

      .fs-button-secondary:hover {
        background: rgba(255, 255, 255, 0.14);
      }

      .fs-button-primary {
        background: rgba(255, 255, 255, 0.92);
        color: #090b12;
        box-shadow: 0 10px 30px rgba(255, 255, 255, 0.12), 0 0 24px rgba(0, 240, 255, 0.14);
      }

      .fs-button-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 34px rgba(255, 255, 255, 0.14), 0 0 30px rgba(0, 240, 255, 0.18);
      }

      @media (max-width: 640px) {
        #uiOverlay {
          padding: 20px;
        }

        .fs-hud {
          top: 18px;
          right: 18px;
        }

        .fs-panel {
          width: calc(100vw - 32px);
          padding: 28px 24px;
          border-radius: 22px;
        }

        .fs-title {
          letter-spacing: 3px;
        }

        .fs-subtitle,
        .fs-meta {
          letter-spacing: 0.16em;
        }

        .fs-audio-button {
          width: 100%;
        }

        .fs-settings-panel {
          width: 100vw;
          padding: 24px 16px 18px;
        }

        .fs-settings-footer {
          flex-direction: column-reverse;
        }

        .fs-button-secondary,
        .fs-button-primary {
          width: 100%;
        }
      }
    </style>
    <div id="visualContainer" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1;
    "></div>
    <div id="uiOverlay" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 10;
      opacity: 0;
    ">
      <div class="fs-hud">
        <button id="settingsToggleBtn" class="fs-settings-button" type="button" aria-label="打开设置">
          ⚙
        </button>
      </div>
      <div class="fs-panel">
        <div class="fs-panel-content">
          <h1 class="fs-title">FlowSpace</h1>
          <div class="fs-divider"></div>
          <div id="energyValue" class="fs-energy">0.0%</div>
          <div class="fs-subtitle">Flow Energy</div>
          <div class="fs-meta">
            <span>Immersive Focus</span>
            <span class="fs-meta-dot"></span>
            <span>Realtime Signal</span>
          </div>
          <div id="audioModeStatus" class="fs-audio-status">智能天气音 · 自动定位</div>
          <div id="audioBtnContainer">
            <button id="startAudioBtn" class="fs-audio-button">
              <span class="fs-audio-icon">◉</span>
              <span>启动音频</span>
            </button>
          </div>
        </div>
      </div>
      <div id="settingsBackdrop" class="fs-settings-backdrop"></div>
      <aside id="settingsPanel" class="fs-settings-panel" aria-hidden="true">
        <div class="fs-settings-header">
          <h2 class="fs-settings-heading">Configuration</h2>
          <button id="settingsCloseBtn" class="fs-settings-close" type="button" aria-label="关闭设置">✕</button>
        </div>
        <p class="fs-settings-copy">
          配置背景环境音来源，并在不打断当前氛围的前提下平滑切换。
        </p>

        <section class="fs-settings-section">
          <h3 class="fs-settings-section-title">系统环境音</h3>
          <p class="fs-settings-section-hint">
            在默认白噪音和基于天气的环境画像之间切换。
          </p>
          <div class="fs-radio-list">
            <label class="fs-radio-option">
              <input type="radio" name="audioSourceType" value="default" />
              <span class="fs-radio-text">
                <span class="fs-radio-label">默认白噪音</span>
                <span class="fs-radio-description">纯净、中性、适合长时间专注的基础底噪。</span>
              </span>
            </label>
            <label class="fs-radio-option">
              <input type="radio" name="audioSourceType" value="weather" />
              <span class="fs-radio-text">
                <span class="fs-radio-label">智能天气音</span>
                <span class="fs-radio-description">优先使用定位城市的天气画像，可手动覆盖为指定城市或天气。</span>
              </span>
            </label>
          </div>
        </section>

        <section class="fs-settings-section">
          <h3 class="fs-settings-section-title">自定义天气音</h3>
          <p class="fs-settings-section-hint">
            输入城市或天气类型，例如“北京”、“东京”、“大雨”或“雷暴”。
          </p>
          <div class="fs-field">
            <label for="customWeatherInput" class="fs-label">覆盖参数</label>
            <input
              id="customWeatherInput"
              class="fs-input"
              type="text"
              placeholder="例如：北京 / 东京 / 大雨 / 雷暴"
              maxlength="40"
            />
          </div>
          <p id="weatherPanelHint" class="fs-settings-section-hint"></p>
        </section>

        <div class="fs-settings-footer">
          <button id="settingsCancelBtn" class="fs-button-secondary" type="button">取消</button>
          <button id="settingsSaveBtn" class="fs-button-primary" type="button">保存设置</button>
        </div>
      </aside>
    </div>
  `;

  const container = document.getElementById('visualContainer');
  if (container) {
    visualManager = new VisualManager(container, (phase) => {
      const uiOverlay = document.getElementById('uiOverlay');
      if (uiOverlay) {
        if (phase === 'stargazing') {
          uiOverlay.style.opacity = '1';
        }
      }
    });
  }

  const btn = document.getElementById('startAudioBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      console.log('🎵 Clicked start audio');
      audioManager.setAudioConfig(audioConfig);
      await audioManager.start();
      const btnContainer = document.getElementById('audioBtnContainer');
      if (btnContainer) {
        btnContainer.style.display = 'none';
      }
    });
  }

  bindSettingsPanelEvents();
  syncSettingsUI();
}

function setSettingsOpen(isOpen: boolean) {
  const panel = document.getElementById('settingsPanel');
  const backdrop = document.getElementById('settingsBackdrop');

  if (!panel || !backdrop) {
    return;
  }

  panel.classList.toggle('is-open', isOpen);
  backdrop.classList.toggle('is-open', isOpen);
  panel.setAttribute('aria-hidden', String(!isOpen));
}

function getSelectedAudioSourceType(): AudioSourceType {
  const selected = document.querySelector<HTMLInputElement>('input[name="audioSourceType"]:checked');
  return selected?.value === 'default' ? 'default' : 'weather';
}

function resolveAudioStatusText(): string {
  if (audioConfig.sourceType === 'default') {
    return '默认白噪音 · Pure Focus Noise';
  }

  if (audioConfig.customWeatherParam.trim()) {
    return `智能天气音 · ${audioConfig.customWeatherParam.trim()}`;
  }

  if (startupWeather) {
    const ambienceLabel = startupWeather.ambience === 'rain' ? '雨声画像' : '风声画像';
    return `智能天气音 · ${startupWeather.city} · ${ambienceLabel}`;
  }

  return '智能天气音 · 自动定位';
}

function syncSettingsUI() {
  const defaultRadio = document.querySelector<HTMLInputElement>('input[name="audioSourceType"][value="default"]');
  const weatherRadio = document.querySelector<HTMLInputElement>('input[name="audioSourceType"][value="weather"]');
  const customWeatherInput = document.getElementById('customWeatherInput') as HTMLInputElement | null;
  const weatherPanelHint = document.getElementById('weatherPanelHint');
  const audioModeStatus = document.getElementById('audioModeStatus');

  if (defaultRadio) {
    defaultRadio.checked = audioConfig.sourceType === 'default';
  }

  if (weatherRadio) {
    weatherRadio.checked = audioConfig.sourceType === 'weather';
  }

  if (customWeatherInput) {
    customWeatherInput.value = audioConfig.customWeatherParam;
    customWeatherInput.disabled = audioConfig.sourceType !== 'weather';
  }

  if (weatherPanelHint) {
    if (startupWeather) {
      const resolvedLabel = startupWeather.ambience === 'rain' ? '雨声' : '风声';
      weatherPanelHint.textContent = `当前定位：${startupWeather.city}, ${startupWeather.country} · ${resolvedLabel} · 可留空以继续自动匹配。`;
    } else {
      weatherPanelHint.textContent = '当前定位未加载，留空时将继续使用系统默认天气画像。';
    }
  }

  if (audioModeStatus) {
    audioModeStatus.textContent = resolveAudioStatusText();
  }
}

function bindSettingsPanelEvents() {
  const settingsToggleBtn = document.getElementById('settingsToggleBtn');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const settingsCancelBtn = document.getElementById('settingsCancelBtn');
  const settingsSaveBtn = document.getElementById('settingsSaveBtn');
  const settingsBackdrop = document.getElementById('settingsBackdrop');
  const customWeatherInput = document.getElementById('customWeatherInput') as HTMLInputElement | null;

  settingsToggleBtn?.addEventListener('click', () => {
    syncSettingsUI();
    setSettingsOpen(true);
  });

  settingsCloseBtn?.addEventListener('click', () => setSettingsOpen(false));
  settingsCancelBtn?.addEventListener('click', () => {
    syncSettingsUI();
    setSettingsOpen(false);
  });
  settingsBackdrop?.addEventListener('click', () => setSettingsOpen(false));

  document.querySelectorAll<HTMLInputElement>('input[name="audioSourceType"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isWeather = getSelectedAudioSourceType() === 'weather';
      if (customWeatherInput) {
        customWeatherInput.disabled = !isWeather;
        if (isWeather) {
          customWeatherInput.focus();
        }
      }
    });
  });

  settingsSaveBtn?.addEventListener('click', () => {
    audioConfig = {
      sourceType: getSelectedAudioSourceType(),
      customWeatherParam: customWeatherInput?.value.trim() ?? '',
    };

    audioManager.setAudioConfig(audioConfig);
    syncSettingsUI();
    setSettingsOpen(false);
  });
}

function setupRenderLifecycle() {
  const syncRenderingState = () => {
    if (!visualManager) {
      return;
    }

    const shouldRender = !document.hidden && document.hasFocus();
    visualManager.setRenderingActive(shouldRender);
  };

  document.addEventListener('visibilitychange', syncRenderingState);
  window.addEventListener('blur', syncRenderingState);
  window.addEventListener('focus', syncRenderingState);
  syncRenderingState();
}

async function loadStartupWeather(isTauri: boolean) {
  if (!isTauri) {
    startupWeather = null;
    audioManager.setWeatherAmbience('wind');
    syncSettingsUI();
    return;
  }

  try {
    const coordinates = await getUserCoordinates();
    const weather = await invoke<StartupWeather>('fetch_startup_weather', coordinates ?? {});
    startupWeather = weather;
    audioManager.setWeatherAmbience(weather.ambience);
    console.log(
      `🌦️ Startup weather loaded: ${weather.city}, ${weather.country} | ${weather.ambience} | code=${weather.weatherCode} | temp=${weather.temperatureC.toFixed(1)}C | locationSource=${weather.locationSource}`,
    );
    syncSettingsUI();
  } catch (error) {
    startupWeather = null;
    console.error('❌ Startup weather fetch failed, fallback to wind ambience:', error);
    audioManager.setWeatherAmbience('wind');
    syncSettingsUI();
  }
}

async function getUserCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  if (!('geolocation' in navigator)) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 3000,
        maximumAge: 30 * 60 * 1000,
      },
    );
  });
}

function updateEnergy(energy: number) {
  const energyElement = document.getElementById('energyValue');
  if (energyElement) {
    energyElement.textContent = `${(energy * 100).toFixed(1)}%`;
    const glowAlpha = 0.18 + energy * 0.62;
    const hue = 205 + energy * 18;
    const glowColor = `hsla(${hue}, 100%, 72%, ${0.24 + energy * 0.52})`;

    energyElement.style.setProperty('--energy-intensity', energy.toFixed(3));
    energyElement.style.setProperty('--energy-glow-alpha', glowAlpha.toFixed(3));
    energyElement.style.setProperty('--energy-glow-color', glowColor);
    energyElement.style.transform = `scale(${1 + energy * 0.015})`;
  }

  const uiOverlay = document.getElementById('uiOverlay');
  if (uiOverlay) {
    uiOverlay.style.setProperty('--energy-intensity', energy.toFixed(3));
    uiOverlay.style.setProperty(
      '--panel-highlight',
      `rgba(255, 255, 255, ${0.1 + energy * 0.08})`,
    );
  }
  audioManager.updateEnergy(energy);
  if (visualManager) {
    visualManager.updateEnergy(energy);
  }
}

async function main() {
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.background = '#050505';

  createUI();
  setupRenderLifecycle();

  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

  console.log('🔍 isTauri:', isTauri);
  await loadStartupWeather(Boolean(isTauri));

  if (isTauri) {
    console.log('✅ 检测到 Tauri 环境，连接 Rust 后端...');
    
    try {
      console.log('📡 正在监听 flow-energy-update 事件...');
      await listen<number>('flow-energy-update', (event) => {
        updateEnergy(event.payload);
      });
      console.log('✅ 事件监听器已启动！');
    } catch (error) {
      console.error('❌ Tauri 事件监听失败:', error);
    }
  } else {
    console.log('⚠️  检测到浏览器环境，此项目需要 Tauri 桌面环境运行！');
  }
}

main();
