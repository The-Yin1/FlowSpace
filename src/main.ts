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
let playlistConfig: PlaylistConfig = {
  platform: 'netease',
  value: '',
};
let playlistEmbedState: PlaylistEmbedState = {
  embed: null,
  isCollapsed: false,
  error: '',
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

type PlaylistPlatform = 'qq' | 'netease' | 'apple' | 'kugou';

type PlaylistConfig = {
  platform: PlaylistPlatform;
  value: string;
};

type PlaylistEmbed = {
  platform: PlaylistPlatform;
  title: string;
  embedUrl: string;
  externalUrl: string;
  height: number;
  note: string;
};

type PlaylistEmbedState = {
  embed: PlaylistEmbed | null;
  isCollapsed: boolean;
  error: string;
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

      .fs-center-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
        width: min(560px, calc(100vw - 48px));
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
        width: 100%;
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

      .fs-player-shell {
        width: 100%;
        pointer-events: auto;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        background: rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(16px) saturate(125%);
        -webkit-backdrop-filter: blur(16px) saturate(125%);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.26);
        overflow: hidden;
        opacity: 0;
        max-height: 0;
        transform: translateY(12px);
        transition:
          opacity 0.28s ease,
          max-height 0.34s ease,
          transform 0.34s ease,
          border-color 0.28s ease;
      }

      .fs-player-shell.is-visible {
        opacity: 1;
        max-height: 560px;
        transform: translateY(0);
      }

      .fs-player-shell.is-collapsed .fs-player-body {
        display: none;
      }

      .fs-player-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.025);
      }

      .fs-player-meta {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .fs-player-label {
        font-size: 0.72rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.38);
      }

      .fs-player-title {
        font-size: 0.9rem;
        color: rgba(255, 255, 255, 0.88);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .fs-player-actions {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .fs-player-link,
      .fs-player-toggle {
        border: none;
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.24s ease;
      }

      .fs-player-link {
        padding: 9px 14px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.84);
        text-decoration: none;
        font-size: 0.82rem;
      }

      .fs-player-link:hover {
        background: rgba(255, 255, 255, 0.14);
      }

      .fs-player-toggle {
        width: 34px;
        height: 34px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.92rem;
      }

      .fs-player-toggle:hover {
        background: rgba(255, 255, 255, 0.14);
      }

      .fs-player-body {
        padding: 0 16px 16px;
      }

      .fs-player-frame-wrap {
        border-radius: 12px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
      }

      .fs-player-iframe {
        display: block;
        width: 100%;
        border: none;
        background: transparent;
        opacity: 0.92;
      }

      .fs-player-note {
        margin: 10px 2px 0;
        font-size: 0.78rem;
        line-height: 1.55;
        color: rgba(255, 255, 255, 0.42);
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

      .fs-select {
        appearance: none;
        background-image:
          linear-gradient(45deg, transparent 50%, rgba(255, 255, 255, 0.48) 50%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.48) 50%, transparent 50%);
        background-position:
          calc(100% - 22px) calc(50% - 2px),
          calc(100% - 16px) calc(50% - 2px);
        background-size: 6px 6px, 6px 6px;
        background-repeat: no-repeat;
        padding-right: 42px;
      }

      .fs-inline-hint {
        margin: 0;
        font-size: 0.76rem;
        line-height: 1.55;
        color: rgba(255, 255, 255, 0.36);
      }

      .fs-error-text {
        margin: 2px 0 0;
        font-size: 0.8rem;
        line-height: 1.55;
        color: rgba(255, 159, 159, 0.92);
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

        .fs-center-stack {
          width: calc(100vw - 32px);
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

        .fs-player-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .fs-player-actions {
          width: 100%;
          justify-content: space-between;
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
      <div class="fs-center-stack">
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
        <section id="playlistPlayerShell" class="fs-player-shell" aria-hidden="true">
          <div class="fs-player-header">
            <div class="fs-player-meta">
              <div class="fs-player-label">External Playlist</div>
              <div id="playlistPlayerTitle" class="fs-player-title"></div>
            </div>
            <div class="fs-player-actions">
              <a
                id="playlistPlayerLink"
                class="fs-player-link"
                href="#"
                target="_blank"
                rel="noreferrer"
              >
                打开平台页
              </a>
              <button id="playlistPlayerToggle" class="fs-player-toggle" type="button" aria-label="折叠播放器">
                ▾
              </button>
            </div>
          </div>
          <div id="playlistPlayerBody" class="fs-player-body"></div>
        </section>
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

        <section class="fs-settings-section">
          <h3 class="fs-settings-section-title">外接歌单</h3>
          <p class="fs-settings-section-hint">
            接入第三方音乐平台歌单，系统会根据平台自动解析分享链接或歌单 ID。
          </p>
          <div class="fs-field">
            <label for="playlistPlatformSelect" class="fs-label">平台</label>
            <select id="playlistPlatformSelect" class="fs-input fs-select">
              <option value="qq">QQ音乐</option>
              <option value="netease">网易云音乐</option>
              <option value="apple">Apple Music</option>
              <option value="kugou">酷狗音乐</option>
            </select>
          </div>
          <div class="fs-field">
            <label for="playlistInput" class="fs-label">歌单 ID / 分享链接</label>
            <input
              id="playlistInput"
              class="fs-input"
              type="text"
              placeholder="请输入您的歌单 ID 或 官方分享链接"
              maxlength="240"
            />
          </div>
          <p id="playlistInputHint" class="fs-inline-hint">
            支持直接粘贴官方分享链接；Apple Music 建议使用完整分享链接。
          </p>
          <p id="playlistErrorText" class="fs-error-text"></p>
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

function getPlaylistPlatformLabel(platform: PlaylistPlatform): string {
  switch (platform) {
    case 'qq':
      return 'QQ音乐';
    case 'netease':
      return '网易云音乐';
    case 'apple':
      return 'Apple Music';
    case 'kugou':
      return '酷狗音乐';
    default:
      return '歌单';
  }
}

function normalizeUrlInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^(music\.apple\.com|embed\.music\.apple\.com|music\.163\.com|y\.qq\.com|i\.y\.qq\.com|www\.kugou\.com|m\.kugou\.com)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

function extractFirstMatch(patterns: RegExp[], input: string): string | null {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function parsePlaylistEmbed(config: PlaylistConfig): PlaylistEmbedState {
  const rawValue = normalizeUrlInput(config.value);

  if (!rawValue) {
    return {
      embed: null,
      isCollapsed: false,
      error: '',
    };
  }

  if (config.platform === 'netease') {
    const id = extractFirstMatch(
      [
        /playlist\?id=(\d+)/i,
        /playlist\/(\d+)/i,
        /^(\d+)$/i,
      ],
      rawValue,
    );

    if (!id) {
      return {
        embed: null,
        isCollapsed: false,
        error: '网易云音乐请输入歌单 ID，或形如 music.163.com/.../playlist?id=123 的官方链接。',
      };
    }

    return {
      embed: {
        platform: 'netease',
        title: `网易云音乐歌单 #${id}`,
        embedUrl: `https://music.163.com/outchain/player?type=0&id=${id}&auto=1&height=66`,
        externalUrl: `https://music.163.com/#/playlist?id=${id}`,
        height: 110,
        note: '使用网易云音乐官方 outchain 播放器。',
      },
      isCollapsed: false,
      error: '',
    };
  }

  if (config.platform === 'qq') {
    const id = extractFirstMatch(
      [
        /interactive_playlist\.html\?id=(\d+)/i,
        /playlist\/(\d+)/i,
        /id=(\d+)/i,
        /^(\d+)$/i,
      ],
      rawValue,
    );

    if (!id) {
      return {
        embed: null,
        isCollapsed: false,
        error: 'QQ音乐请输入歌单 ID，或形如 y.qq.com/.../playlist/123、i.y.qq.com/...id=123 的官方链接。',
      };
    }

    return {
      embed: {
        platform: 'qq',
        title: `QQ音乐歌单 #${id}`,
        embedUrl: `https://i.y.qq.com/n2/m/share/details/interactive_playlist.html?id=${id}`,
        externalUrl: `https://y.qq.com/n/ryqq/playlist/${id}`,
        height: 460,
        note: '使用 QQ 音乐官方移动歌单页作为嵌入载体，实际展示效果取决于平台 iframe 策略。',
      },
      isCollapsed: false,
      error: '',
    };
  }

  if (config.platform === 'apple') {
    const normalized = rawValue;
    const embedDirectMatch = normalized.match(/^https:\/\/embed\.music\.apple\.com\/[^\s]+$/i);

    if (embedDirectMatch) {
      return {
        embed: {
          platform: 'apple',
          title: 'Apple Music Playlist',
          embedUrl: normalized,
          externalUrl: normalized.replace('https://embed.music.apple.com', 'https://music.apple.com'),
          height: 450,
          note: '使用 Apple Music 官方 embed 页面。',
        },
        isCollapsed: false,
        error: '',
      };
    }

    const appleMatch = normalized.match(/^https:\/\/music\.apple\.com\/([a-z]{2}(?:-[a-z]{2})?)\/playlist\/[^/]+\/(pl\.[a-z0-9]+)/i);
    if (!appleMatch) {
      return {
        embed: null,
        isCollapsed: false,
        error: 'Apple Music 请使用完整官方分享链接，或直接粘贴 embed.music.apple.com 链接。',
      };
    }

    const storefront = appleMatch[1];
    const playlistId = appleMatch[2];
    const path = normalized.replace(/^https:\/\/music\.apple\.com/i, '');

    return {
      embed: {
        platform: 'apple',
        title: `Apple Music 歌单 ${playlistId}`,
        embedUrl: `https://embed.music.apple.com${path}`,
        externalUrl: normalized,
        height: 450,
        note: `使用 Apple Music 官方嵌入地址，区域 storefront 为 ${storefront.toUpperCase()}。`,
      },
      isCollapsed: false,
      error: '',
    };
  }

  const kugouId = extractFirstMatch(
    [
      /special\/single\/(\d+)\.html/i,
      /songlist\/(\d+)/i,
      /id=(\d+)/i,
      /^(\d+)$/i,
    ],
    rawValue,
  );

  if (!kugouId) {
    return {
      embed: null,
      isCollapsed: false,
      error: '酷狗音乐请输入歌单 ID，或官方歌单链接。',
    };
  }

  return {
    embed: {
      platform: 'kugou',
      title: `酷狗音乐歌单 #${kugouId}`,
      embedUrl: `https://www.kugou.com/yy/special/single/${kugouId}.html`,
      externalUrl: `https://www.kugou.com/yy/special/single/${kugouId}.html`,
      height: 460,
      note: '酷狗公开免密 iframe 能力有限，这里优先嵌入官方歌单页；若平台拦截，可通过右上角按钮跳转官方页面。',
    },
    isCollapsed: false,
    error: '',
  };
}

function renderPlaylistPlayer() {
  const shell = document.getElementById('playlistPlayerShell');
  const title = document.getElementById('playlistPlayerTitle');
  const link = document.getElementById('playlistPlayerLink') as HTMLAnchorElement | null;
  const body = document.getElementById('playlistPlayerBody');
  const toggle = document.getElementById('playlistPlayerToggle');

  if (!shell || !title || !link || !body || !toggle) {
    return;
  }

  const embed = playlistEmbedState.embed;

  if (!embed) {
    shell.classList.remove('is-visible', 'is-collapsed');
    shell.setAttribute('aria-hidden', 'true');
    title.textContent = '';
    link.href = '#';
    body.innerHTML = '';
    toggle.textContent = '▾';
    return;
  }

  shell.classList.add('is-visible');
  shell.classList.toggle('is-collapsed', playlistEmbedState.isCollapsed);
  shell.setAttribute('aria-hidden', 'false');
  title.textContent = `${getPlaylistPlatformLabel(embed.platform)} · ${embed.title}`;
  link.href = embed.externalUrl;
  toggle.textContent = playlistEmbedState.isCollapsed ? '▸' : '▾';

  body.innerHTML = `
    <div class="fs-player-frame-wrap">
      <iframe
        class="fs-player-iframe"
        title="${embed.title}"
        src="${embed.embedUrl}"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        style="height: ${embed.height}px;"
      ></iframe>
    </div>
    <p class="fs-player-note">${embed.note}</p>
  `;
}

function syncSettingsUI() {
  const defaultRadio = document.querySelector<HTMLInputElement>('input[name="audioSourceType"][value="default"]');
  const weatherRadio = document.querySelector<HTMLInputElement>('input[name="audioSourceType"][value="weather"]');
  const customWeatherInput = document.getElementById('customWeatherInput') as HTMLInputElement | null;
  const weatherPanelHint = document.getElementById('weatherPanelHint');
  const audioModeStatus = document.getElementById('audioModeStatus');
  const playlistPlatformSelect = document.getElementById('playlistPlatformSelect') as HTMLSelectElement | null;
  const playlistInput = document.getElementById('playlistInput') as HTMLInputElement | null;
  const playlistErrorText = document.getElementById('playlistErrorText');

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

  if (playlistPlatformSelect) {
    playlistPlatformSelect.value = playlistConfig.platform;
  }

  if (playlistInput) {
    playlistInput.value = playlistConfig.value;
  }

  if (playlistErrorText) {
    playlistErrorText.textContent = playlistEmbedState.error;
  }

  renderPlaylistPlayer();
}

function bindSettingsPanelEvents() {
  const settingsToggleBtn = document.getElementById('settingsToggleBtn');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const settingsCancelBtn = document.getElementById('settingsCancelBtn');
  const settingsSaveBtn = document.getElementById('settingsSaveBtn');
  const settingsBackdrop = document.getElementById('settingsBackdrop');
  const customWeatherInput = document.getElementById('customWeatherInput') as HTMLInputElement | null;
  const playlistPlatformSelect = document.getElementById('playlistPlatformSelect') as HTMLSelectElement | null;
  const playlistInput = document.getElementById('playlistInput') as HTMLInputElement | null;
  const playlistPlayerToggle = document.getElementById('playlistPlayerToggle');

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

  playlistPlayerToggle?.addEventListener('click', () => {
    if (!playlistEmbedState.embed) {
      return;
    }

    playlistEmbedState = {
      ...playlistEmbedState,
      isCollapsed: !playlistEmbedState.isCollapsed,
    };
    renderPlaylistPlayer();
  });

  settingsSaveBtn?.addEventListener('click', () => {
    audioConfig = {
      sourceType: getSelectedAudioSourceType(),
      customWeatherParam: customWeatherInput?.value.trim() ?? '',
    };

    playlistConfig = {
      platform: (playlistPlatformSelect?.value as PlaylistPlatform) || 'netease',
      value: playlistInput?.value.trim() ?? '',
    };
    playlistEmbedState = parsePlaylistEmbed(playlistConfig);

    audioManager.setAudioConfig(audioConfig);
    syncSettingsUI();

    if (!playlistEmbedState.error) {
      setSettingsOpen(false);
    }
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
