import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AudioManager, type WeatherAmbience } from './audio/AudioManager';
import { VisualManager } from './visual/VisualManager';

const audioManager = new AudioManager();
let visualManager: VisualManager | null = null;

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

      @media (max-width: 640px) {
        #uiOverlay {
          padding: 20px;
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
          <div id="audioBtnContainer">
            <button id="startAudioBtn" class="fs-audio-button">
              <span class="fs-audio-icon">◉</span>
              <span>启动音频</span>
            </button>
          </div>
        </div>
      </div>
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
      await audioManager.start();
      const btnContainer = document.getElementById('audioBtnContainer');
      if (btnContainer) {
        btnContainer.style.display = 'none';
      }
    });
  }
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
    audioManager.setWeatherAmbience('wind');
    return;
  }

  try {
    const coordinates = await getUserCoordinates();
    const weather = await invoke<StartupWeather>('fetch_startup_weather', coordinates ?? {});
    audioManager.setWeatherAmbience(weather.ambience);
    console.log(
      `🌦️ Startup weather loaded: ${weather.city}, ${weather.country} | ${weather.ambience} | code=${weather.weatherCode} | temp=${weather.temperatureC.toFixed(1)}C | locationSource=${weather.locationSource}`,
    );
  } catch (error) {
    console.error('❌ Startup weather fetch failed, fallback to wind ambience:', error);
    audioManager.setWeatherAmbience('wind');
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
