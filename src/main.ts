import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  AudioManager,
  type AudioConfig,
  type AudioWeatherContext,
  type AudioSourceType,
} from './audio/AudioManager';
import { VisualManager } from './visual/VisualManager';
import {
  type LocationPermissionState,
} from './audio/LocationPermissionManager';
type StartupWeather = AudioWeatherContext;

type PermissionStatus = {
  platform: string;
  accessibilityGranted: boolean;
  inputMonitoringGranted: boolean;
  inputMonitoringStatus: string;
  shouldShowGuidance: boolean;
  accessibilityPrompted: boolean;
  message: string;
};

type PlaylistPlatform = 'qq' | 'netease' | 'apple' | 'kugou';
type MixerCategoryId = 'nature' | 'rain' | 'animals';

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

type AudioMixerTrack = {
  id: string;
  name: string;
  icon: string;
  src: string;
};

type AudioMixerCategory = {
  id: MixerCategoryId;
  name: string;
  icon: string;
  tracks: AudioMixerTrack[];
};

type AudioMixerTrackWithCategory = AudioMixerTrack & {
  categoryId: MixerCategoryId;
};

type TrackRuntimeState = {
  volume: number;
  isActive: boolean;
  isFavorite: boolean;
  element: HTMLAudioElement | null;
};

type WeatherAudioState = 'idle' | 'running' | 'paused';
type WindowResizeDirection =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'NorthEast'
  | 'NorthWest'
  | 'SouthEast'
  | 'SouthWest';

const audioManager = new AudioManager();
let visualManager: VisualManager | null = null;
let startupWeather: StartupWeather | null = null;
let permissionStatus: PermissionStatus | null = null;
let currentEnergy = 0;
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
let selectedCategoryId: MixerCategoryId = 'nature';
let weatherAudioState: WeatherAudioState = 'idle';
let viewMode: 'standard' | 'mini' = 'standard';
let isGhostMode = false;
let activeWeatherAudioSources: string[] = [];

const weatherAudioElements = new Map<string, HTMLAudioElement>();

const audioMixerData: AudioMixerCategory[] = [
  {
    id: 'nature',
    name: '自然',
    icon: 'tree-icon',
    tracks: [
      { id: 'river', name: '河流', icon: 'wave', src: '/nature/river.mp3' },
      { id: 'waves', name: '海浪', icon: 'ocean', src: '/nature/waves.mp3' },
      { id: 'bonfire', name: '篝火', icon: 'fire', src: '/nature/campfire.mp3' },
      { id: 'wind', name: '风声', icon: 'wind', src: '/nature/wind.mp3' },
      { id: 'howling_wind', name: '呼啸风声', icon: 'wind-bold', src: '/nature/howling-wind.mp3' },
      { id: 'forest_wind', name: '树林风声', icon: 'leaf', src: '/nature/wind-in-trees.mp3' },
      { id: 'waterfall', name: '瀑布', icon: 'waterfall', src: '/nature/waterfall.mp3' },
      { id: 'snow_walk', name: '雪地行走', icon: 'snow', src: '/nature/walk-in-snow.mp3' },
      { id: 'leaf_walk', name: '落叶行走', icon: 'leaf-fall', src: '/nature/walk-on-leaves.mp3' },
      { id: 'gravel_walk', name: '碎石行走', icon: 'stone', src: '/nature/walk-on-gravel.mp3' },
      { id: 'water_drop', name: '水滴', icon: 'drop', src: '/nature/droplets.mp3' },
      { id: 'jungle', name: '丛林', icon: 'forest', src: '/nature/jungle.mp3' },
    ],
  },
  {
    id: 'rain',
    name: '雨声',
    icon: 'rain-icon',
    tracks: [
      { id: 'light_rain', name: '小雨', icon: 'rain-1', src: '/rain/light-rain.mp3' },
      { id: 'heavy_rain', name: '大雨', icon: 'rain-2', src: '/rain/heavy-rain.mp3' },
      { id: 'window_rain', name: '窗户雨声', icon: 'window', src: '/rain/rain-on-window.mp3' },
      { id: 'umbrella_rain', name: '雨伞雨声', icon: 'umbrella', src: '/rain/rain-on-umbrella.mp3' },
      { id: 'car_rain', name: '车顶雨声', icon: 'car', src: '/rain/rain-on-car-roof.mp3' },
      { id: 'leaf_rain', name: '树叶雨声', icon: 'leaf-rain', src: '/rain/rain-on-leaves.mp3' },
      { id: 'tent_rain', name: '帐篷雨声', icon: 'tent', src: '/rain/rain-on-tent.mp3' },
      { id: 'thunder', name: '雷声', icon: 'thunder', src: '/rain/thunder.mp3' },
    ],
  },
  {
    id: 'animals',
    name: '动物',
    icon: 'animal-icon',
    tracks: [
      { id: 'birds', name: '鸟鸣', icon: 'bird', src: '/animals/birds.mp3' },
      { id: 'beehive', name: '蜂巢', icon: 'bee', src: '/animals/beehive.mp3' },
      { id: 'cat_purr', name: '猫咪呼噜', icon: 'cat', src: '/animals/cat_purring.mp3' },
      { id: 'rooster', name: '鸡鸣', icon: 'rooster', src: '/animals/chickens.mp3' },
      { id: 'cow', name: '牛叫', icon: 'cow', src: '/animals/cows.mp3' },
      { id: 'cricket', name: '蟋蟀', icon: 'cricket', src: '/animals/crickets.mp3' },
      { id: 'crow', name: '乌鸦', icon: 'crow', src: '/animals/crows.mp3' },
      { id: 'dog', name: '狗叫', icon: 'dog', src: '/animals/dog-barking.mp3' },
      { id: 'frog', name: '青蛙', icon: 'frog', src: '/animals/frog.mp3' },
      { id: 'horse_gallop', name: '马蹄声', icon: 'horse', src: '/animals/horse-gallop.mp3' },
      { id: 'owl', name: '猫头鹰', icon: 'owl', src: '/animals/owl.mp3' },
      { id: 'seagull', name: '海鸥', icon: 'seagull', src: '/animals/seagulls.mp3' },
    ],
  },
];

const mixerTracks = audioMixerData.flatMap<AudioMixerTrackWithCategory>((category) =>
  category.tracks.map((track) => ({ ...track, categoryId: category.id })),
);

const trackRuntimeState = new Map<string, TrackRuntimeState>(
  mixerTracks.map((track) => [
    track.id,
    {
      volume: 0.5,
      isActive: false,
      isFavorite: false,
      element: null,
    },
  ]),
);

function getTrackRuntimeState(trackId: string): TrackRuntimeState {
  const state = trackRuntimeState.get(trackId);
  if (!state) {
    throw new Error(`Unknown track id: ${trackId}`);
  }
  return state;
}

function getWeatherAudioElementVolume(trackCount = activeWeatherAudioSources.length): number {
  const normalizedEnergy = Math.max(0, Math.min(1, currentEnergy));
  const baseVolume = trackCount > 1 ? 0.18 : 0.26;
  return Math.max(0.12, Math.min(0.42, baseVolume + normalizedEnergy * 0.08));
}

function ensureWeatherAudioElement(src: string): HTMLAudioElement {
  let element = weatherAudioElements.get(src);
  if (!element) {
    element = new Audio(src);
    element.loop = true;
    element.preload = 'auto';
    weatherAudioElements.set(src, element);
  }

  element.volume = getWeatherAudioElementVolume();
  return element;
}

function syncWeatherAudioVolumes() {
  const volume = getWeatherAudioElementVolume();
  activeWeatherAudioSources.forEach((src) => {
    const element = weatherAudioElements.get(src);
    if (element) {
      element.volume = volume;
    }
  });
}

function pauseWeatherAudioElements(resetTime: boolean) {
  activeWeatherAudioSources.forEach((src) => {
    const element = weatherAudioElements.get(src);
    if (!element) {
      return;
    }

    element.pause();
    if (resetTime) {
      element.currentTime = 0;
    }
  });
}

async function playWeatherAudioSources(resourcePaths: string[]) {
  const nextSources = Array.from(new Set(resourcePaths.filter(Boolean)));
  const nextSourceSet = new Set(nextSources);

  activeWeatherAudioSources
    .filter((src) => !nextSourceSet.has(src))
    .forEach((src) => {
      const element = weatherAudioElements.get(src);
      if (!element) {
        return;
      }

      element.pause();
      element.currentTime = 0;
    });

  activeWeatherAudioSources = nextSources;
  syncWeatherAudioVolumes();

  for (const src of activeWeatherAudioSources) {
    const element = ensureWeatherAudioElement(src);
    try {
      await element.play();
    } catch (error) {
      console.error(`❌ Weather audio play failed: ${src}`, error);
    }
  }
}

async function syncWeatherAudioPlayback(options: { forceRefresh?: boolean } = {}) {
  audioManager.setAudioConfig(audioConfig);

  if (audioConfig.sourceType === 'weather') {
    startupWeather = await audioManager.loadWeatherContext({
      forceRefresh: options.forceRefresh ?? false,
    });
  }

  await playWeatherAudioSources(audioManager.getWeatherResourcePaths());
}

function createUI() {
  const app = document.getElementById('app') as HTMLDivElement;
  app.innerHTML = `
    <style>
      :root {
        --energy-intensity: 0;
        --energy-glow-color: hsla(205, 100%, 72%, 0.3);
        --energy-glow-alpha: 0.3;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
      }

      body {
        margin: 0;
        overflow: hidden;
        font-family: Inter, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
        background: #040507;
        color: rgba(255, 255, 255, 0.92);
      }

      button,
      input,
      select {
        font: inherit;
      }

      #visualContainer canvas {
        display: block;
      }

      #uiOverlay {
        position: fixed;
        inset: 0;
        z-index: 10;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.5s ease;
      }

      #uiOverlay .fs-topbar,
      #uiOverlay .fs-studio-panel,
      #uiOverlay .fs-settings-panel,
      #uiOverlay .fs-settings-backdrop {
        pointer-events: none;
      }

      #uiOverlay.is-ready {
        opacity: 1;
      }

      #uiOverlay.is-ready .fs-topbar,
      #uiOverlay.is-ready .fs-studio-panel,
      #uiOverlay.is-ready .fs-settings-panel,
      #uiOverlay.is-ready .fs-settings-backdrop.is-open {
        pointer-events: auto;
      }

      .fs-topbar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 16;
        height: 72px;
        display: grid;
        grid-template-columns: minmax(180px, 1fr) auto minmax(220px, 1fr);
        align-items: center;
        gap: 24px;
        padding: 0 26px;
        pointer-events: auto;
        background: rgba(15, 15, 20, 0.6);
        backdrop-filter: blur(20px) saturate(130%);
        -webkit-backdrop-filter: blur(20px) saturate(130%);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        box-shadow: 0 16px 44px rgba(0, 0, 0, 0.24);
      }

      .fs-brand {
        display: inline-flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }

      .fs-brand-mark {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background:
          radial-gradient(circle at 32% 30%, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0) 44%),
          linear-gradient(135deg, rgba(0, 240, 255, 0.18), rgba(176, 132, 255, 0.12));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 22px rgba(0, 240, 255, 0.12);
      }

      .fs-brand-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .fs-brand-title {
        margin: 0;
        font-size: 0.86rem;
        font-weight: 500;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        background: linear-gradient(90deg, rgba(255, 255, 255, 0.94), rgba(145, 235, 255, 0.92), rgba(207, 181, 255, 0.9));
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .fs-brand-subtitle {
        font-size: 0.7rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.34);
      }

      .fs-status-cluster {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }

      .fs-status-main {
        display: inline-flex;
        align-items: baseline;
        gap: 12px;
      }

      .fs-status-energy {
        margin: 0;
        font-size: clamp(2rem, 3.5vw, 3rem);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.05em;
        color: rgba(248, 251, 255, 0.98);
        text-shadow:
          0 0 14px rgba(255, 255, 255, 0.12),
          0 0 26px var(--energy-glow-color),
          0 0 52px rgba(0, 240, 255, calc(var(--energy-glow-alpha) + var(--energy-intensity) * 0.2));
      }

      .fs-status-label {
        font-size: 0.74rem;
        font-weight: 600;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.42);
      }

      .fs-status-meta {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 0.7rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.28);
      }

      .fs-meta-separator {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        box-shadow: 0 0 14px rgba(0, 240, 255, 0.16);
      }

      .fs-topbar-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
      }

      .fs-audio-control {
        min-width: 132px;
        height: 42px;
        padding: 0 18px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.92);
        color: #090b11;
        font-size: 0.88rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        box-shadow: 0 10px 26px rgba(255, 255, 255, 0.12), 0 0 20px rgba(0, 240, 255, 0.14);
        transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .fs-audio-control:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 32px rgba(255, 255, 255, 0.14), 0 0 28px rgba(0, 240, 255, 0.2);
      }

      .fs-settings-button {
        width: 42px;
        height: 42px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.54);
        font-size: 1rem;
        cursor: pointer;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        transition: all 0.24s ease;
      }

      .fs-settings-button:hover {
        color: rgba(255, 255, 255, 0.92);
        background: rgba(255, 255, 255, 0.14);
        box-shadow: 0 0 22px rgba(0, 240, 255, 0.14);
      }

      .fs-permission-banner {
        position: fixed;
        top: 86px;
        left: 24px;
        right: 24px;
        z-index: 14;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 14px 18px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.018)),
          rgba(15, 18, 24, 0.72);
        backdrop-filter: blur(22px) saturate(130%);
        -webkit-backdrop-filter: blur(22px) saturate(130%);
        box-shadow:
          0 18px 42px rgba(0, 0, 0, 0.28),
          0 0 26px rgba(0, 240, 255, 0.05);
        pointer-events: auto;
      }

      .fs-permission-banner[hidden] {
        display: none;
      }

      .fs-permission-copy {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }

      .fs-permission-eyebrow {
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.36);
      }

      .fs-permission-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: rgba(255, 255, 255, 0.94);
      }

      .fs-permission-message,
      .fs-permission-note {
        margin: 0;
        font-size: 0.84rem;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.58);
      }

      .fs-permission-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .fs-permission-button {
        height: 38px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.86);
        font-size: 0.82rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        cursor: pointer;
        transition: all 0.24s ease;
      }

      .fs-permission-button:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.13);
        border-color: rgba(255, 255, 255, 0.12);
      }

      .fs-permission-button.is-primary {
        background: rgba(255, 255, 255, 0.92);
        color: #0a0b10;
        box-shadow: 0 10px 24px rgba(255, 255, 255, 0.12);
      }

      .fs-permission-button.is-primary:hover {
        box-shadow: 0 14px 28px rgba(255, 255, 255, 0.16);
      }

      .fs-workspace {
        position: fixed;
        inset: 154px 24px 28px;
        display: flex;
        justify-content: center;
        pointer-events: none;
      }

      .fs-studio-panel {
        width: min(1220px, 100%);
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 22px 22px 18px;
        border-radius: 28px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015) 35%, rgba(255, 255, 255, 0.02)),
          rgba(12, 14, 18, 0.58);
        backdrop-filter: blur(24px) saturate(135%);
        -webkit-backdrop-filter: blur(24px) saturate(135%);
        box-shadow:
          0 28px 80px rgba(0, 0, 0, 0.46),
          inset 0 1px 0 rgba(255, 255, 255, 0.06),
          0 0 56px rgba(0, 240, 255, calc(var(--energy-intensity) * 0.08));
        pointer-events: auto;
        overflow: hidden;
      }

      .fs-studio-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
      }

      .fs-studio-copy {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .fs-studio-eyebrow {
        font-size: 0.74rem;
        font-weight: 600;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.42);
      }

      .fs-studio-title {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: rgba(255, 255, 255, 0.96);
      }

      .fs-studio-summary {
        margin: 0;
        font-size: 0.88rem;
        line-height: 1.65;
        color: rgba(255, 255, 255, 0.46);
      }

      .fs-studio-stats {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .fs-stat-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: rgba(255, 255, 255, 0.05);
        font-size: 0.78rem;
        color: rgba(255, 255, 255, 0.68);
      }

      .fs-stat-chip strong {
        color: rgba(255, 255, 255, 0.96);
      }

      .fs-player-shell {
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        background: rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(16px) saturate(125%);
        -webkit-backdrop-filter: blur(16px) saturate(125%);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.24);
        overflow: hidden;
        opacity: 0;
        max-height: 0;
        transform: translateY(12px);
        transition: opacity 0.28s ease, max-height 0.34s ease, transform 0.34s ease;
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
        gap: 16px;
        padding: 16px;
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

      .fs-player-link:hover,
      .fs-player-toggle:hover {
        background: rgba(255, 255, 255, 0.14);
      }

      .fs-player-toggle {
        width: 34px;
        height: 34px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.92rem;
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
        opacity: 0.94;
      }

      .fs-player-note {
        margin: 10px 2px 0;
        font-size: 0.78rem;
        line-height: 1.55;
        color: rgba(255, 255, 255, 0.42);
      }

      .fs-category-nav {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 2px;
      }

      .fs-category-nav::-webkit-scrollbar {
        display: none;
      }

      .fs-category-button {
        position: relative;
        min-width: 120px;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.03);
        color: rgba(255, 255, 255, 0.68);
        cursor: pointer;
        transition: all 0.28s ease;
      }

      .fs-category-button:hover {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.92);
      }

      .fs-category-button.is-active {
        border-color: rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.07);
        color: rgba(255, 255, 255, 0.96);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04), 0 0 28px rgba(0, 240, 255, 0.12);
      }

      .fs-category-button.is-active .fs-category-icon {
        border-color: rgba(255, 255, 255, 0.18);
        background: linear-gradient(135deg, rgba(0, 240, 255, 0.22), rgba(184, 136, 255, 0.16));
        box-shadow: 0 0 0 4px rgba(0, 240, 255, 0.08), 0 0 22px rgba(0, 240, 255, 0.2);
      }

      .fs-category-icon {
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.07);
        background: rgba(255, 255, 255, 0.04);
        font-size: 1rem;
      }

      .fs-category-icon svg {
        display: block;
      }

      .fs-category-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
      }

      .fs-category-name {
        font-size: 0.92rem;
        font-weight: 600;
      }

      .fs-category-count {
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.38);
      }

      .fs-mixer-grid {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-right: 6px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
      }

      .fs-mixer-grid::-webkit-scrollbar {
        width: 8px;
      }

      .fs-mixer-grid::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
      }

      .fs-track-card {
        position: relative;
        min-height: 282px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 18px 18px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.04);
        background: rgba(20, 20, 25, 0.75);
        transition: all 0.4s ease;
        cursor: pointer;
        overflow: hidden;
      }

      .fs-track-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0));
        opacity: 0.7;
        pointer-events: none;
      }

      .fs-track-card:hover {
        transform: translateY(-2px);
        border-color: rgba(255, 255, 255, 0.08);
      }

      .fs-track-card.is-active {
        border-color: rgba(255, 255, 255, 0.16);
        box-shadow: 0 0 20px rgba(255, 255, 255, 0.08), 0 0 36px rgba(0, 240, 255, 0.08);
      }

      .fs-track-card.is-unavailable {
        opacity: 0.66;
      }

      .fs-track-card.is-unavailable .fs-track-toggle,
      .fs-track-card.is-unavailable .fs-track-slider {
        cursor: not-allowed;
      }

      .fs-track-top {
        position: relative;
        z-index: 1;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .fs-track-badge {
        display: inline-flex;
        align-items: center;
        height: 26px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 0.7rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.4);
      }

      .fs-track-favorite {
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.04);
        color: rgba(255, 255, 255, 0.42);
        cursor: pointer;
        transition: all 0.24s ease;
      }

      .fs-track-favorite:hover {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.82);
      }

      .fs-track-favorite.is-favorite {
        color: rgba(255, 220, 220, 0.96);
        background: rgba(255, 255, 255, 0.09);
        box-shadow: 0 0 16px rgba(255, 128, 160, 0.14);
      }

      .fs-track-body {
        position: relative;
        z-index: 1;
        display: flex;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 14px;
        text-align: center;
      }

      .fs-track-toggle {
        width: 86px;
        height: 86px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.02) 40%, rgba(255, 255, 255, 0.02));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
        font-size: 2rem;
        color: rgba(255, 255, 255, 0.78);
        transition: all 0.32s ease;
      }

      .fs-track-toggle svg {
        display: block;
      }

      .fs-track-card.is-active .fs-track-toggle {
        border-color: rgba(255, 255, 255, 0.16);
        background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.22), rgba(0, 240, 255, 0.1) 34%, rgba(112, 90, 255, 0.08) 62%);
        box-shadow: 0 0 0 8px rgba(0, 240, 255, 0.04), 0 0 30px rgba(0, 240, 255, 0.16);
      }

      .fs-track-name {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.94);
      }

      .fs-track-status {
        margin: 0;
        font-size: 0.76rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.4);
      }

      .fs-track-slider-wrap {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: auto;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }

      .fs-track-slider-meta {
        display: flex;
        justify-content: space-between;
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.5);
      }

      .fs-track-slider {
        --slider-progress: 50%;
        width: 100%;
        margin: 0;
        display: block;
        height: 22px;
        appearance: none;
        background: transparent;
        cursor: pointer;
        touch-action: pan-x;
      }

      .fs-track-slider:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .fs-track-slider:focus {
        outline: none;
      }

      .fs-track-slider::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 999px;
        background:
          linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.68) 0%,
            rgba(255, 255, 255, 0.64) var(--slider-progress),
            rgba(255, 255, 255, 0.1) var(--slider-progress),
            rgba(255, 255, 255, 0.1) 100%
          );
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03), 0 0 10px rgba(0, 240, 255, 0.03);
      }

      .fs-track-slider::-webkit-slider-thumb {
        appearance: none;
        width: 16px;
        height: 16px;
        margin-top: -6px;
        border: none;
        border-radius: 50%;
        background:
          radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.88) 48%, rgba(215, 244, 255, 0.74) 70%, rgba(180, 233, 255, 0.76) 100%);
        box-shadow:
          0 0 0 4px rgba(255, 255, 255, 0.04),
          0 0 10px rgba(255, 255, 255, 0.16),
          0 0 16px rgba(0, 240, 255, 0.1);
        transition: transform 0.16s ease, box-shadow 0.2s ease;
      }

      .fs-track-slider:hover::-webkit-slider-thumb {
        transform: scale(1.04);
      }

      .fs-track-slider:active::-webkit-slider-thumb {
        transform: scale(1.08);
        box-shadow:
          0 0 0 5px rgba(255, 255, 255, 0.06),
          0 0 14px rgba(255, 255, 255, 0.22),
          0 0 20px rgba(0, 240, 255, 0.14);
      }

      .fs-track-slider::-moz-range-track {
        height: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03), 0 0 10px rgba(0, 240, 255, 0.03);
      }

      .fs-track-slider::-moz-range-progress {
        height: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.66);
      }

      .fs-track-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border: none;
        border-radius: 50%;
        background:
          radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.88) 48%, rgba(215, 244, 255, 0.74) 70%, rgba(180, 233, 255, 0.76) 100%);
        box-shadow:
          0 0 0 4px rgba(255, 255, 255, 0.04),
          0 0 10px rgba(255, 255, 255, 0.16),
          0 0 16px rgba(0, 240, 255, 0.1);
      }

      .fs-settings-backdrop {
        position: fixed;
        inset: 0;
        z-index: 18;
        background: rgba(3, 5, 10, 0.3);
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
        width: min(430px, calc(100vw - 20px));
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

      .fs-settings-panel::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.14);
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

      .fs-settings-section-hint,
      .fs-inline-hint,
      .fs-error-text {
        margin: 0;
        font-size: 0.82rem;
        line-height: 1.55;
      }

      .fs-settings-section-hint,
      .fs-inline-hint {
        color: rgba(255, 255, 255, 0.46);
      }

      .fs-error-text {
        color: rgba(255, 159, 159, 0.92);
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

      .fs-settings-footer {
        margin-top: auto;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }

      .fs-settings-actions {
        display: flex;
        gap: 10px;
        margin-top: 10px;
        flex-wrap: wrap;
      }

      .fs-button-secondary,
      .fs-button-primary {
        border: none;
        border-radius: 999px;
        padding: 12px 20px;
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

      @media (max-width: 1024px) {
        .fs-topbar {
          grid-template-columns: 1fr;
          height: auto;
          padding: 16px 18px;
          gap: 12px;
        }

        .fs-status-cluster {
          align-items: flex-start;
        }

        .fs-topbar-actions {
          justify-content: flex-start;
        }

        .fs-permission-banner {
          left: 16px;
          right: 16px;
          top: 146px;
        }

        .fs-workspace {
          inset: 254px 16px 16px;
        }
      }

      @media (max-width: 640px) {
        .fs-permission-banner {
          left: 12px;
          right: 12px;
          top: 154px;
          flex-direction: column;
          align-items: flex-start;
        }

        .fs-permission-actions {
          width: 100%;
          justify-content: stretch;
        }

        .fs-permission-button {
          flex: 1 1 100%;
        }

        .fs-workspace {
          inset: 364px 12px 12px;
        }

        .fs-studio-panel {
          padding: 18px 16px 14px;
          border-radius: 24px;
        }

        .fs-studio-header {
          flex-direction: column;
        }

        .fs-studio-stats {
          justify-content: flex-start;
        }

        .fs-player-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .fs-player-actions {
          width: 100%;
          justify-content: space-between;
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

      /* ---------- Mini Capsule Mode ---------- */
      .fs-workspace,
      .fs-topbar,
      .fs-permission-banner,
      .fs-settings-backdrop,
      .fs-settings-panel {
        transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }

      #uiOverlay.is-mini .fs-topbar,
      #uiOverlay.is-mini .fs-workspace,
      #uiOverlay.is-mini .fs-permission-banner,
      #uiOverlay.is-mini .fs-settings-backdrop,
      #uiOverlay.is-mini .fs-settings-panel {
        opacity: 0;
        pointer-events: none;
        transform: scale(0.96);
      }

      /* 关键：mini 模式下恢复 overlay 本身的事件穿透，否则子元素 pointer-events: auto 也会被父级 none 拦截 */
      #uiOverlay.is-mini {
        pointer-events: auto;
      }

      .fs-mini-capsule {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
        -webkit-user-select: none;
        cursor: move;
      }

      #uiOverlay.is-mini .fs-mini-capsule {
        opacity: 1;
        pointer-events: auto;
      }

      .fs-mini-capsule-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 16px;
        border-radius: 25px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(18, 20, 28, 0.72);
        backdrop-filter: blur(22px) saturate(140%);
        -webkit-backdrop-filter: blur(22px) saturate(140%);
        box-shadow:
          0 8px 32px rgba(0, 0, 0, 0.35),
          0 0 26px rgba(0, 240, 255, 0.06),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }

      .fs-mini-capsule-icon {
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.16), rgba(0, 240, 255, 0.08) 42%, rgba(112, 90, 255, 0.06) 66%);
        box-shadow: 0 0 12px rgba(0, 240, 255, 0.1);
        font-size: 0.9rem;
        color: rgba(255, 255, 255, 0.88);
      }

      .fs-mini-capsule-icon .capsule-ripple {
        position: absolute;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 1px solid rgba(0, 240, 255, 0.3);
        animation: capsule-ripple 2.2s ease-out infinite;
        pointer-events: none;
      }

      .fs-mini-capsule-icon .capsule-ripple:nth-child(2) {
        animation-delay: 0.7s;
      }

      @keyframes capsule-ripple {
        0% {
          transform: scale(1);
          opacity: 0.5;
        }
        100% {
          transform: scale(2.2);
          opacity: 0;
        }
      }

      .fs-mini-capsule-energy {
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: rgba(100, 255, 180, 0.92);
        text-shadow:
          0 0 12px rgba(100, 255, 180, 0.2),
          0 0 24px rgba(0, 240, 180, 0.08);
      }

      .fs-mini-capsule-restore {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.72rem;
        cursor: pointer;
        transition: all 0.24s ease;
      }

      /* 确保胶囊内所有可交互元素不会被误杀 */
      .fs-mini-capsule button,
      .fs-mini-capsule [class*="btn"],
      .fs-mini-capsule [class*="icon"] {
        pointer-events: auto !important;
      }

      .fs-mini-capsule-restore:hover {
        background: rgba(255, 255, 255, 0.16);
        color: rgba(255, 255, 255, 0.92);
      }

      .fs-window-resize-handles {
        position: fixed;
        inset: 0;
        z-index: 40;
        pointer-events: none;
      }

      .fs-window-resize-handle {
        position: absolute;
        pointer-events: auto;
        background: transparent;
      }

      .fs-window-resize-handle[data-resize-direction="North"],
      .fs-window-resize-handle[data-resize-direction="South"] {
        left: 12px;
        right: 12px;
        height: 6px;
        cursor: ns-resize;
      }

      .fs-window-resize-handle[data-resize-direction="North"] {
        top: 0;
      }

      .fs-window-resize-handle[data-resize-direction="South"] {
        bottom: 0;
      }

      .fs-window-resize-handle[data-resize-direction="East"],
      .fs-window-resize-handle[data-resize-direction="West"] {
        top: 12px;
        bottom: 12px;
        width: 6px;
        cursor: ew-resize;
      }

      .fs-window-resize-handle[data-resize-direction="East"] {
        right: 0;
      }

      .fs-window-resize-handle[data-resize-direction="West"] {
        left: 0;
      }

      .fs-window-resize-handle[data-resize-direction="NorthEast"],
      .fs-window-resize-handle[data-resize-direction="SouthWest"] {
        width: 12px;
        height: 12px;
        cursor: nesw-resize;
      }

      .fs-window-resize-handle[data-resize-direction="NorthWest"],
      .fs-window-resize-handle[data-resize-direction="SouthEast"] {
        width: 12px;
        height: 12px;
        cursor: nwse-resize;
      }

      .fs-window-resize-handle[data-resize-direction="NorthEast"] {
        top: 0;
        right: 0;
      }

      .fs-window-resize-handle[data-resize-direction="NorthWest"] {
        top: 0;
        left: 0;
      }

      .fs-window-resize-handle[data-resize-direction="SouthEast"] {
        right: 0;
        bottom: 0;
      }

      .fs-window-resize-handle[data-resize-direction="SouthWest"] {
        left: 0;
        bottom: 0;
      }

      body.is-native-fullscreen .fs-window-resize-handles,
      body.is-mini-mode .fs-window-resize-handles {
        opacity: 0;
        pointer-events: none;
      }

      /* ---------- Ghost Mode (Click-through) ---------- */
      #uiOverlay.is-ghost .fs-topbar,
      #uiOverlay.is-ghost .fs-workspace,
      #uiOverlay.is-ghost .fs-mini-capsule,
      #uiOverlay.is-ghost .fs-settings-panel,
      #uiOverlay.is-ghost .fs-settings-backdrop.is-open {
        opacity: 0.12;
        transition: opacity 0.5s ease;
      }

      #uiOverlay.is-ghost .fs-permission-banner {
        opacity: 0;
        pointer-events: none;
      }

      /* ghost mode hint toast */
      .fs-ghost-toast {
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 40;
        padding: 10px 20px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(10, 12, 18, 0.8);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.76rem;
        letter-spacing: 0.06em;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.4s ease;
        white-space: nowrap;
      }

      #uiOverlay.is-ghost .fs-ghost-toast {
        opacity: 1;
      }

      /* ---------- Mode control buttons ---------- */
      .fs-mode-button {
        width: 38px;
        height: 38px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.5);
        font-size: 0.85rem;
        cursor: pointer;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        transition: all 0.24s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .fs-mode-button:hover {
        background: rgba(255, 255, 255, 0.12);
        color: rgba(255, 255, 255, 0.88);
        box-shadow: 0 0 16px rgba(0, 240, 255, 0.1);
      }

      .fs-mode-button.is-active {
        border-color: rgba(255, 255, 255, 0.16);
        background: rgba(0, 240, 255, 0.12);
        color: rgba(255, 255, 255, 0.92);
        box-shadow: 0 0 18px rgba(0, 240, 255, 0.16);
      }

      .fs-mode-button svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    </style>
    <div id="visualContainer" style="position: fixed; inset: 0; z-index: 1;"></div>
    <div id="uiOverlay">
      <header class="fs-topbar">
        <div class="fs-brand">
          <div class="fs-brand-mark"></div>
          <div class="fs-brand-text">
            <div class="fs-brand-title">FLOWSPACE</div>
            <div class="fs-brand-subtitle">Premium Focus Atmosphere</div>
          </div>
        </div>
        <div class="fs-status-cluster">
          <div class="fs-status-main">
            <div id="energyValue" class="fs-status-energy">0.0%</div>
            <div class="fs-status-label">Flow Energy</div>
          </div>
          <div class="fs-status-meta">
            <span>Immersive Focus</span>
            <span class="fs-meta-separator"></span>
            <span>Realtime Signal</span>
            <span class="fs-meta-separator"></span>
            <span id="audioModeStatus">智能天气音 · 自动定位</span>
          </div>
        </div>
        <div class="fs-topbar-actions">
          <button id="audioControlBtn" class="fs-audio-control" type="button">启动音频</button>
          <button id="miniModeBtn" class="fs-mode-button" type="button" aria-label="微缩胶囊模式" title="微缩胶囊模式">
            <svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="5"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </button>
          <button id="ghostModeBtn" class="fs-mode-button" type="button" aria-label="穿透壁纸模式" title="穿透壁纸模式">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="9" stroke-dasharray="4 3"/></svg>
          </button>
          <button id="settingsToggleBtn" class="fs-settings-button" type="button" aria-label="打开设置">⚙</button>
        </div>
      </header>

      <section id="permissionBanner" class="fs-permission-banner" hidden aria-live="polite">
        <div class="fs-permission-copy">
          <div class="fs-permission-eyebrow">Privacy Guidance</div>
          <h2 id="permissionBannerTitle" class="fs-permission-title">开启键盘监听所需权限</h2>
          <p id="permissionBannerMessage" class="fs-permission-message"></p>
          <p class="fs-permission-note">为了能够精准感知敲击心流，请确保已同时授予“辅助功能”与“输入监控”权限。完成授权后建议重新启动应用。</p>
        </div>
        <div class="fs-permission-actions">
          <button id="requestAccessibilityBtn" class="fs-permission-button is-primary" type="button">授权辅助功能</button>
          <button id="openInputMonitoringBtn" class="fs-permission-button" type="button">打开输入监控</button>
          <button id="refreshPermissionBtn" class="fs-permission-button" type="button">刷新状态</button>
        </div>
      </section>

      <main class="fs-workspace">
        <section class="fs-studio-panel">
          <div class="fs-studio-header">
            <div class="fs-studio-copy">
              <div class="fs-studio-eyebrow">Premium Audio Mixer</div>
              <h2 class="fs-studio-title">高档多音轨调音台</h2>
              <p class="fs-studio-summary">
                在不影响底层心流监测的前提下，叠加独立环境轨道，形成更细腻的暗调微光专注空间。
              </p>
            </div>
            <div class="fs-studio-stats">
              <div class="fs-stat-chip">当前分类 <strong id="selectedCategoryLabel">自然</strong></div>
              <div class="fs-stat-chip">激活音轨 <strong id="activeTrackCount">0</strong></div>
              <div class="fs-stat-chip">收藏 <strong id="favoriteTrackCount">0</strong></div>
            </div>
          </div>

          <section id="playlistPlayerShell" class="fs-player-shell" aria-hidden="true">
            <div class="fs-player-header">
              <div class="fs-player-meta">
                <div class="fs-player-label">External Playlist</div>
                <div id="playlistPlayerTitle" class="fs-player-title"></div>
              </div>
              <div class="fs-player-actions">
                <a id="playlistPlayerLink" class="fs-player-link" href="#" target="_blank" rel="noreferrer">
                  打开平台页
                </a>
                <button id="playlistPlayerToggle" class="fs-player-toggle" type="button" aria-label="折叠播放器">▾</button>
              </div>
            </div>
            <div id="playlistPlayerBody" class="fs-player-body"></div>
          </section>

          <nav id="categoryNav" class="fs-category-nav" aria-label="音频分类"></nav>
          <section id="mixerGrid" class="fs-mixer-grid" aria-label="环境音混音矩阵"></section>
        </section>
      </main>

      <div id="settingsBackdrop" class="fs-settings-backdrop"></div>
      <aside id="settingsPanel" class="fs-settings-panel" aria-hidden="true">
        <div class="fs-settings-header">
          <h2 class="fs-settings-heading">Configuration</h2>
          <button id="settingsCloseBtn" class="fs-settings-close" type="button" aria-label="关闭设置">✕</button>
        </div>
        <p class="fs-settings-copy">配置背景环境音、外接歌单与天气覆盖参数，所有切换都尽量平滑，不打断当前氛围。</p>

        <section class="fs-settings-section">
          <h3 class="fs-settings-section-title">系统环境音</h3>
          <p class="fs-settings-section-hint">在默认白噪音和基于天气的环境画像之间切换。</p>
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
          <p class="fs-settings-section-hint">输入城市或天气类型，例如“北京”、“东京”、“大雨”或“雷暴”。</p>
          <div class="fs-field">
            <label for="customWeatherInput" class="fs-label">覆盖参数</label>
            <input id="customWeatherInput" class="fs-input" type="text" placeholder="例如：北京 / 东京 / 大雨 / 雷暴" maxlength="40" />
          </div>
          <p id="weatherPanelHint" class="fs-settings-section-hint"></p>
        </section>

        <section class="fs-settings-section">
          <h3 class="fs-settings-section-title">外接歌单</h3>
          <p class="fs-settings-section-hint">接入第三方音乐平台歌单，系统会根据平台自动解析分享链接或歌单 ID。</p>
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
            <input id="playlistInput" class="fs-input" type="text" placeholder="请输入您的歌单 ID 或 官方分享链接" maxlength="240" />
          </div>
          <p class="fs-inline-hint">支持直接粘贴官方分享链接；Apple Music 建议使用完整分享链接。</p>
          <p id="playlistErrorText" class="fs-error-text"></p>
        </section>

        <div class="fs-settings-footer">
          <button id="settingsCancelBtn" class="fs-button-secondary" type="button">取消</button>
          <button id="settingsSaveBtn" class="fs-button-primary" type="button">保存设置</button>
        </div>
      </aside>

      <!-- Mini Capsule View -->
      <div class="fs-mini-capsule">
        <div class="fs-mini-capsule-bar">
          <div class="fs-mini-capsule-icon" style="position:relative;">
            <span id="miniCapsuleIcon">✦</span>
            <span class="capsule-ripple"></span>
            <span class="capsule-ripple"></span>
          </div>
          <span id="miniCapsuleEnergy" class="fs-mini-capsule-energy">0.0% FLOW</span>
          <button id="miniRestoreBtn" class="fs-mini-capsule-restore" type="button" aria-label="恢复大窗口" title="恢复大窗口">↩</button>
        </div>
      </div>

      <!-- Ghost mode hint toast -->
      <div class="fs-ghost-toast">Ghost Mode · 按 Option(⌥)+G 退出穿透</div>
    </div>
    <div class="fs-window-resize-handles" aria-hidden="true">
      <div class="fs-window-resize-handle" data-resize-direction="North"></div>
      <div class="fs-window-resize-handle" data-resize-direction="South"></div>
      <div class="fs-window-resize-handle" data-resize-direction="East"></div>
      <div class="fs-window-resize-handle" data-resize-direction="West"></div>
      <div class="fs-window-resize-handle" data-resize-direction="NorthEast"></div>
      <div class="fs-window-resize-handle" data-resize-direction="NorthWest"></div>
      <div class="fs-window-resize-handle" data-resize-direction="SouthEast"></div>
      <div class="fs-window-resize-handle" data-resize-direction="SouthWest"></div>
    </div>
  `;

  const container = document.getElementById('visualContainer');
  if (container) {
    visualManager = new VisualManager(container, (phase) => {
      const uiOverlay = document.getElementById('uiOverlay');
      if (uiOverlay && phase === 'stargazing') {
        uiOverlay.classList.add('is-ready');
      }
    });
  }

  bindWeatherAudioEvents();
  bindModeControlEvents();
  bindPermissionEvents();
  setupPermissionChangeListener();
  bindMixerEvents();
  bindSettingsPanelEvents();
  renderCategoryNav();
  renderMixerGrid();
  syncSettingsUI();
}

function getIconGlyph(icon: string): string {
  const iconMap: Record<string, string> = {
    'tree-icon': '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="m20 18-4-5h3l-4-5h2l-5-6-5 6h2l-4 5h3l-4 5h7v4h2v-4z"></path></svg>',
    'rain-icon': '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M4.158 12.025a.5.5 0 0 1 .316.633l-.5 1.5a.5.5 0 1 1-.948-.316l.5-1.5a.5.5 0 0 1 .632-.317m3 0a.5.5 0 0 1 .316.633l-1 3a.5.5 0 1 1-.948-.316l1-3a.5.5 0 0 1 .632-.317m3 0a.5.5 0 0 1 .316.633l-.5 1.5a.5.5 0 1 1-.948-.316l.5-1.5a.5.5 0 0 1 .632-.317m3 0a.5.5 0 0 1 .316.633l-1 3a.5.5 0 1 1-.948-.316l1-3a.5.5 0 0 1 .632-.317m.247-6.998a5.001 5.001 0 0 0-9.499-1.004A3.5 3.5 0 1 0 3.5 11H13a3 3 0 0 0 .405-5.973"></path></svg>',
    'animal-icon': '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M139.7 23.52c-9.1 30.54-16.5 61.64-12.7 91.58 4.2 32.7 21 64.9 65.7 95.7-53.6 74.8-86.1 204.4-59.3 277.7 10.9-54 14.2-97.8 53.5-144.6 77.5-25.6 123.9-37.6 140.3-125.7 6.2-14.7 12.6-19.3 31.9-24.7 10.6-2.9 22.2-7.5 22.1-19.2-.2-49.3-28.3-68.4-57.6-67.9-29.4.5-60 20.6-65.4 49.8-6 1.8-11.9 4.5-17.7 8-62.9-43.7-82.1-85.86-100.8-140.68zM32.03 107c10.8 27.2 26.44 54.6 49.2 76.1 24.27 22.9 56.47 39.3 100.87 42.2-34.5-24.2-54.8-50.3-65.2-77.2-29.4-10.9-56.47-25-84.87-41.1zm300.07 26.3a12.24 12.24 0 0 1 12.2 12.2 12.24 12.24 0 0 1-12.2 12.2 12.24 12.24 0 0 1-12.2-12.2 12.24 12.24 0 0 1 12.2-12.2zm60 56.1c-3.5 5.1-7.1 10.2-16.1 13.2 33.9 25.3 79.1 76.5 104 105-11.2-33.2-55.8-88.6-87.9-118.2z"></path></svg>',
    wave: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M5.996 9c1.413 0 2.16-.747 2.705-1.293.49-.49.731-.707 1.292-.707s.802.217 1.292.707C11.83 8.253 12.577 9 13.991 9c1.415 0 2.163-.747 2.71-1.293.491-.49.732-.707 1.295-.707s.804.217 1.295.707C19.837 8.253 20.585 9 22 9V7c-.563 0-.804-.217-1.295-.707C20.159 5.747 19.411 5 17.996 5s-2.162.747-2.709 1.292c-.491.491-.731.708-1.296.708-.562 0-.802-.217-1.292-.707C12.154 5.747 11.407 5 9.993 5s-2.161.747-2.706 1.293c-.49.49-.73.707-1.291.707s-.801-.217-1.291-.707C4.16 5.747 3.413 5 2 5v2c.561 0 .801.217 1.291.707C3.836 8.253 4.583 9 5.996 9zm0 5c1.413 0 2.16-.747 2.705-1.293.49-.49.731-.707 1.292-.707s.802.217 1.292.707c.545.546 1.292 1.293 2.706 1.293 1.415 0 2.163-.747 2.71-1.293.491-.49.732-.707 1.295-.707s.804.217 1.295.707C19.837 13.253 20.585 14 22 14v-2c-.563 0-.804-.217-1.295-.707-.546-.546-1.294-1.293-2.709-1.293s-2.162.747-2.709 1.292c-.491.491-.731.708-1.296.708-.562 0-.802-.217-1.292-.707C12.154 10.747 11.407 10 9.993 10s-2.161.747-2.706 1.293c-.49.49-.73.707-1.291.707s-.801-.217-1.291-.707C4.16 10.747 3.413 10 2 10v2c.561 0 .801.217 1.291.707C3.836 13.253 4.583 14 5.996 14zm0 5c1.413 0 2.16-.747 2.705-1.293.49-.49.731-.707 1.292-.707s.802.217 1.292.707c.545.546 1.292 1.293 2.706 1.293 1.415 0 2.163-.747 2.71-1.293.491-.49.732-.707 1.295-.707s.804.217 1.295.707C19.837 18.253 20.585 19 22 19v-2c-.563 0-.804-.217-1.295-.707-.546-.546-1.294-1.293-2.709-1.293s-2.162.747-2.709 1.292c-.491.491-.731.708-1.296.708-.562 0-.802-.217-1.292-.707C12.154 15.747 11.407 15 9.993 15s-2.161.747-2.706 1.293c-.49.49-.73.707-1.291.707s-.801-.217-1.291-.707C4.16 15.747 3.413 15 2 15v2c.561 0 .801.217 1.291.707C3.836 18.253 4.583 19 5.996 19z" stroke="#94A3B8" fill="#94A3B8" stroke-width="0px"></path></svg>',
    ocean: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M562.1 383.9c-21.5-2.4-42.1-10.5-57.9-22.9-14.1-11.1-34.2-11.3-48.2 0-37.9 30.4-107.2 30.4-145.7-1.5-13.5-11.2-33-9.1-46.7 1.8-38 30.1-106.9 30-145.2-1.7-13.5-11.2-33.3-8.9-47.1 2-15.5 12.2-36 20.1-57.7 22.4-7.9.8-13.6 7.8-13.6 15.7v32.2c0 9.1 7.6 16.8 16.7 16 28.8-2.5 56.1-11.4 79.4-25.9 56.5 34.6 137 34.1 192 0 56.5 34.6 137 34.1 192 0 23.3 14.2 50.9 23.3 79.1 25.8 9.1.8 16.7-6.9 16.7-16v-31.6c.1-8-5.7-15.4-13.8-16.3zm0-144c-21.5-2.4-42.1-10.5-57.9-22.9-14.1-11.1-34.2-11.3-48.2 0-37.9 30.4-107.2 30.4-145.7-1.5-13.5-11.2-33-9.1-46.7 1.8-38 30.1-106.9 30-145.2-1.7-13.5-11.2-33.3-8.9-47.1 2-15.5 12.2-36 20.1-57.7 22.4-7.9.8-13.6 7.8-13.6 15.7v32.2c0 9.1 7.6 16.8 16.7 16 28.8-2.5 56.1-11.4 79.4-25.9 56.5 34.6 137 34.1 192 0 56.5 34.6 137 34.1 192 0 23.3 14.2 50.9 23.3 79.1 25.8 9.1.8 16.7-6.9 16.7-16v-31.6c.1-8-5.7-15.4-13.8-16.3zm0-144C540.6 93.4 520 85.4 504.2 73 490.1 61.9 470 61.7 456 73c-37.9 30.4-107.2 30.4-145.7-1.5-13.5-11.2-33-9.1-46.7 1.8-38 30.1-106.9 30-145.2-1.7-13.5-11.2-33.3-8.9-47.1 2-15.5 12.2-36 20.1-57.7 22.4-7.9.8-13.6 7.8-13.6 15.7v32.2c0 9.1 7.6 16.8 16.7 16 28.8-2.5 56.1-11.4 79.4-25.9 56.5 34.6 137 34.1 192 0 56.5 34.6 137 34.1 192 0 23.3 14.2 50.9 23.3 79.1 25.8 9.1.8 16.7-6.9 16.7-16v-31.6c.1-8-5.7-15.4-13.8-16.3z" stroke="#94A3B8" fill="#94A3B8" stroke-width="0px"></path></svg>',
    fire: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16m0-1c-1.657 0-3-1-3-2.75 0-.75.25-2 1.25-3C6.125 10 7 10.5 7 10.5c-.375-1.25.5-3.25 2-3.5-.179 1-.25 2 1 3 .625.5 1 1.364 1 2.25C11 14 9.657 15 8 15" stroke="#94A3B8" fill="#94A3B8" stroke-width="0px"></path></svg>',
    wind: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M156.7 256H16c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h142.2c15.9 0 30.8 10.9 33.4 26.6 3.3 20-12.1 37.4-31.6 37.4-14.1 0-26.1-9.2-30.4-21.9-2.1-6.3-8.6-10.1-15.2-10.1H81.6c-9.8 0-17.7 8.8-15.9 18.4 8.6 44.1 47.6 77.6 94.2 77.6 57.1 0 102.7-50.1 95.2-108.6C249 291 205.4 256 156.7 256zM16 224h336c59.7 0 106.8-54.8 93.8-116.7-7.6-36.2-36.9-65.5-73.1-73.1-55.4-11.6-105.1 24.9-114.9 75.5-1.9 9.6 6.1 18.3 15.8 18.3h32.8c6.7 0 13.1-3.8 15.2-10.1C325.9 105.2 337.9 96 352 96c19.4 0 34.9 17.4 31.6 37.4-2.6 15.7-17.4 26.6-33.4 26.6H16c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16zm384 32H243.7c19.3 16.6 33.2 38.8 39.8 64H400c26.5 0 48 21.5 48 48s-21.5 48-48 48c-17.9 0-33.3-9.9-41.6-24.4-2.9-5-8.7-7.6-14.5-7.6h-33.8c-10.9 0-19 10.8-15.3 21.1 17.8 50.6 70.5 84.8 129.4 72.3 41.2-8.7 75.1-41.6 84.7-82.7C526 321.5 470.5 256 400 256z" stroke="#94A3B8" fill="#94A3B8" stroke-width="0px"></path></svg>',
    'wind-bold': '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M156.7 256H16c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h142.2c15.9 0 30.8 10.9 33.4 26.6 3.3 20-12.1 37.4-31.6 37.4-14.1 0-26.1-9.2-30.4-21.9-2.1-6.3-8.6-10.1-15.2-10.1H81.6c-9.8 0-17.7 8.8-15.9 18.4 8.6 44.1 47.6 77.6 94.2 77.6 57.1 0 102.7-50.1 95.2-108.6C249 291 205.4 256 156.7 256zM16 224h336c59.7 0 106.8-54.8 93.8-116.7-7.6-36.2-36.9-65.5-73.1-73.1-55.4-11.6-105.1 24.9-114.9 75.5-1.9 9.6 6.1 18.3 15.8 18.3h32.8c6.7 0 13.1-3.8 15.2-10.1C325.9 105.2 337.9 96 352 96c19.4 0 34.9 17.4 31.6 37.4-2.6 15.7-17.4 26.6-33.4 26.6H16c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16zm384 32H243.7c19.3 16.6 33.2 38.8 39.8 64H400c26.5 0 48 21.5 48 48s-21.5 48-48 48c-17.9 0-33.3-9.9-41.6-24.4-2.9-5-8.7-7.6-14.5-7.6h-33.8c-10.9 0-19 10.8-15.3 21.1 17.8 50.6 70.5 84.8 129.4 72.3 41.2-8.7 75.1-41.6 84.7-82.7C526 321.5 470.5 256 400 256z" stroke="#94A3B8" fill="#94A3B8" stroke-width="0px"></path></svg>',
    leaf: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="m20 18-4-5h3l-4-5h2l-5-6-5 6h2l-4 5h3l-4 5h7v4h2v-4z"></path></svg>',
    waterfall: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M432.3 28.66c-13.4 0-26.6 6.43-40.5 19.98-4 3.94-7.8 8.06-11.6 12.12 3.7 5.59 6.1 12.64 7.7 18.46 5.6-6.15 11.1-12.41 16.5-17.76 10.1-9.98 19.1-15.59 26.9-14.66 16.1 1.9 23.7 6.55 29.6 12.81 5.9 6.26 10.1 15.12 16.4 25.18l15.2-9.58c-5.5-8.82-10-18.95-18.5-28.01-14.6-12.13-28.3-18.55-41.7-18.54zM113.7 45.63c-53.35.23-77.7 17.56-95.66 35.88l12.86 12.6c17.42-17.77 35.03-31.75 90-30.32l34.5 32.52h15c-.2-8.94-7.8-17.4-12.6-22.5-14.9-16.14-24.1-28.22-44.1-28.18zm146.7 9.79c-10.1 0-20.2.21-29.6.57 3.8 8.38 5.6 17.38 6.6 24.88 1 11.64-15.6 12.34-17.8 2.42-1.2-8.61-4.6-19.79-8.9-26.23-15.2 1-28.9 2.35-40.3 3.73 7.3 8.95 18 21.8 18 31.02.5 89.69-2.8 180.09-9.7 270.89 1.6-1.7 3.2-3.4 4.9-4.9 8.4-7.6 18.4-13.7 30-13h.1c2.6.2 5.1.7 7.5 1.4.2-16.6.6-30.9.1-44.4 5.3 5.6 10.7 10 18-.6.7 17.6-.1 35.5-.3 56.9 1.1 1.1 2 2.2 3 3.3 7.4 8.6 13.4 19.2 18.4 29.6 1.8 3.8 3.4 7.5 4.9 11.1 1.3-56.5.5-112.9-2.2-169.4 8.6 11.3 13.3 7 18-.8 2.7 56.6 3.5 113.3 2.2 169.9 11.4-11.3 25.1-22.9 41.6-22.6 4.1.1 7.8 1 11.2 2.5l.1-23.9c7.9 8.9 13.4 6.9 18 0L354 396c3.5 3.6 6.9 7.9 9.8 11.7 3.9-2 8.9-4.4 14.9-7l-5.7-73.9c6 5.5 12 10 18-1.4l5.3 68.5c6.6-2.3 13.5-4.2 20.4-5-11.2-93.4-25.2-192-44.3-296.39h.1c-1.4-7.39-3.3-14.6-5.9-19.56-2.5-4.95-5-7.23-8.7-8.07-18.2-4.12-37.7-6.65-57.3-8.04 8.6 17.14 8.4 34.97 8.6 49.66 1.1 10.8-17.2 17-18 .2-.3-18.71.2-35.46-12.7-50.98-6-.2-12-.29-18.1-.3zm90.8 31.52C362.6 130.7 371.8 206.4 378.3 251c-.9 17.6-14.2 13.4-17.8 2.6-6.5-45-16.1-121.1-26.7-162.09 9.9 7.7 16 6.9 17.4-4.57zM224 107c3.5 55 2.4 109.1-.7 162.5.2 11-15.3 14.1-18-1 3.1-53 4.2-106.3.7-160.3 8.9 13.3 14.2 9.3 18-1.2zm51.5 22.5c3.2 27.5 4.3 42.9 3.9 59.9-6.4 9.5-12.3 7.9-18-.4.4-16-.7-30.2-3.7-57.5 7 8.6 12.8 6.6 17.8-2zm52.3 27.2c3.4 50.7 4.3 90 5.6 154.8-5 5.4-9.8 11.7-18 .4-1.3-64.8-2.2-103.7-5.6-154 7.5 9.3 13.1 6 18-1.2zm-246 180.8c-10.73-.3-16.16 18.9-13.38 29.3 3.68 13.8 34.78 24.8 34.78 24.8s-2-53.6-21.4-54.1zm47.4-.4c-.8.6-1.3 1.4-1.7 2.3-4.2 9.9 22.6 23.1 22.6 23.1s5.9-17.4.6-22.8c-4.7-4.8-16.6-7-21.5-2.6zm319.5-3.8c-.5 0-.9 0-1.3.1-11.7 2.2-13.9 23.8-8.3 34.9 0 0 18.8-9.1 19.8-18 .8-6.3-4-16.8-10.2-17zm29.8 20.5c-20.3 1.1-16.8 58.6-16.8 58.6s27.7-10.5 31.2-22.9c3.5-12.3-1.6-36.4-14.4-35.7zm-282.8 17.3c-6.5 5.9-13 14.6-18.7 23.5-11.2 17.8-18.8 36-18.8 36l-3.6 8.7c-22-11.1-36.9-16.8-57.82-17.6-13.41-.5-24.76 11.5-27.43 22.4-1.41 6.4 0 14.3 9.09 25.6 120.56 14.8 310.86 21.1 411.06.4 3.5-16.4-2.3-27.7-13-37.9-11.7-11.3-29.8-19.6-45-24.5-7.3-2.4-24.9 1.2-39.4 6.9-14.6 5.8-26.4 12.5-26.4 12.5l-7.4 4.2-4.6-7s-4.8-7.3-11.3-14.4c-6.6-7.1-15.5-12.7-17.7-12.7-6.6-.1-20.7 9.2-31.5 20.3-10.7 11-18.6 22.2-18.6 22.2l-11 15.5-5.1-18.3s-5.3-19.1-14.4-38.1c-4.5-9.6-10-19-15.7-25.7-12.7-13.4-20.3-13-32.7-2zM35.58 384c-4.27-.1-7.98 1.2-9.85 4.5-8.27 14.4 30.78 39.3 30.78 39.3s6.88-26.5-.99-35.3c-4.19-4.6-12.83-8.4-19.94-8.5z"></path></svg>',
    snow: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M440.1 355.2l-39.2-23 34.1-9.3c8.4-2.3 13.4-11.1 11.1-19.6l-4.1-15.5c-2.2-8.5-10.9-13.6-19.3-11.3L343 298.2 271.2 256l71.9-42.2 79.7 21.7c8.4 2.3 17-2.8 19.3-11.3l4.1-15.5c2.2-8.5-2.7-17.3-11.1-19.6l-34.1-9.3 39.2-23c7.5-4.4 10.1-14.2 5.8-21.9l-7.9-13.9c-4.3-7.7-14-10.3-21.5-5.9l-39.2 23 9.1-34.7c2.2-8.5-2.7-17.3-11.1-19.6l-15.2-4.1c-8.4-2.3-17 2.8-19.3 11.3l-21.3 81-71.9 42.2v-84.5L306 70.4c6.1-6.2 6.1-16.4 0-22.6l-11.1-11.3c-6.1-6.2-16.1-6.2-22.2 0l-24.9 25.4V16c0-8.8-7-16-15.7-16h-15.7c-8.7 0-15.7 7.2-15.7 16v46.1l-24.9-25.4c-6.1-6.2-16.1-6.2-22.2 0L142.1 48c-6.1 6.2-6.1 16.4 0 22.6l58.3 59.3v84.5l-71.9-42.2-21.3-81c-2.2-8.5-10.9-13.6-19.3-11.3L72.7 84c-8.4 2.3-13.4 11.1-11.1 19.6l9.1 34.7-39.2-23c-7.5-4.4-17.1-1.8-21.5 5.9l-7.9 13.9c-4.3 7.7-1.8 17.4 5.8 21.9l39.2 23-34.1 9.1c-8.4 2.3-13.4 11.1-11.1 19.6L6 224.2c2.2 8.5 10.9 13.6 19.3 11.3l79.7-21.7 71.9 42.2-71.9 42.2-79.7-21.7c-8.4-2.3-17 2.8-19.3 11.3l-4.1 15.5c-2.2 8.5 2.7 17.3 11.1 19.6l34.1 9.3-39.2 23c-7.5 4.4-10.1 14.2-5.8 21.9L10 391c4.3 7.7 14 10.3 21.5 5.9l39.2-23-9.1 34.7c-2.2 8.5 2.7 17.3 11.1 19.6l15.2 4.1c8.4 2.3 17-2.8 19.3-11.3l21.3-81 71.9-42.2v84.5l-58.3 59.3c-6.1 6.2-6.1 16.4 0 22.6l11.1 11.3c6.1 6.2 16.1 6.2 22.2 0l24.9-25.4V496c0 8.8 7 16 15.7 16h15.7c8.7 0 15.7-7.2 15.7-16v-46.1l24.9 25.4c6.1 6.2 16.1 6.2 22.2 0l11.1-11.3c6.1-6.2 6.1-16.4 0-22.6l-58.3-59.3v-84.5l71.9 42.2 21.3 81c2.2 8.5 10.9 13.6 19.3 11.3L375 428c8.4-2.3 13.4-11.1 11.1-19.6l-9.1-34.7 39.2 23c7.5 4.4 17.1 1.8 21.5-5.9l7.9-13.9c4.6-7.5 2.1-17.3-5.5-21.7z"></path></svg>',
    'leaf-fall': '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M546.2 9.7c-5.6-12.5-21.6-13-28.3-1.2C486.9 62.4 431.4 96 368 96h-80C182 96 96 182 96 288c0 7 .8 13.7 1.5 20.5C161.3 262.8 253.4 224 384 224c8.8 0 16 7.2 16 16s-7.2 16-16 16C132.6 256 26 410.1 2.4 468c-6.6 16.3 1.2 34.9 17.5 41.6 16.4 6.8 35-1.1 41.8-17.3 1.5-3.6 20.9-47.9 71.9-90.6 32.4 43.9 94 85.8 174.9 77.2C465.5 467.5 576 326.7 576 154.3c0-50.2-10.8-102.2-29.8-144.6z"></path></svg>',
    stone: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M317.727 108.904l-95.192 96.592-26.93 86.815 17.54 36.723 20.417 9.287 33.182-55.082 11.297-3.61 61.75 26.85 20.26-12.998 4.47-43.7 11.42 53.634-10.622 14.162 3.772 1.64 5.238 6.5 6.832 34.343 55.977-66.775 13.98.23 22.397 28.575-9.453-52.244L434.01 166.81l-116.28-57.906zM123.61 120.896L94.08 173l-4.603 27.62 25.98-8.442 11.704 7.377.084.634 28.295 59.865 13.773-4.543 10.94 4.668 3.922 8.21 19.517-62.917-1.074-33.336-40.15-.522-29.732-23.78 34.06 10.888 42.49-7.727 26.034 15.88 36.282-36.815c-2.777-1.18-5.615-2.356-8.58-3.52l-79.58 10.126-3.528-.25-56.307-15.52zm249.33 36.422l47.058 66.02 2.107 62.51-25.283-59.698-65.322-60.404 41.44-8.428zm-262.2 55.32l-64.234 20.876-16.71 78.552 50.794 5.582.596-7.14 37.662-36.707-8.108-61.16zm56.688 62.45l-36.44 12.016-31.644 30.84 22.588 30.867 57.326 1.74 16.5-16.16-28.33-59.302zm110.666 24.19l-44.307 73.546-.033 57.14 97.264 12.216 44.242-19.528-17.666-88.806-79.5-34.567zM443.8 313.36l-46.843 55.876.287 1.774 65.147 13.887 25.78-14.926-44.37-56.613zm-138.382 15.89l39.23 22.842 13.41 50.658-26.82 23.838-45.015-2.553 38.562-28.242 2.483-39.23-21.85-27.312zm-238.37 53.838l-8.77 28.51 13.152 48.498 91.037-11.91 1.32-26.418-62.582-31.995-34.156-6.684z"></path></svg>',
    drop: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M8 16a6 6 0 0 0 6-6c0-1.655-1.122-2.904-2.432-4.362C10.254 4.176 8.75 2.503 8 0c0 0-6 5.686-6 10a6 6 0 0 0 6 6M6.646 4.646l.708.708c-.29.29-1.128 1.311-1.907 2.87l-.894-.448c.82-1.641 1.717-2.753 2.093-3.13"></path></svg>',
    forest: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 384 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M378.31 378.49L298.42 288h30.63c9.01 0 16.98-5 20.78-13.06 3.8-8.04 2.55-17.26-3.28-24.05L268.42 160h28.89c9.1 0 17.3-5.35 20.86-13.61 3.52-8.13 1.86-17.59-4.24-24.08L203.66 4.83c-6.03-6.45-17.28-6.45-23.32 0L70.06 122.31c-6.1 6.49-7.75 15.95-4.24 24.08C69.38 154.65 77.59 160 86.69 160h28.89l-78.14 90.91c-5.81 6.78-7.06 15.99-3.27 24.04C37.97 283 45.93 288 54.95 288h30.63L5.69 378.49c-6 6.79-7.36 16.09-3.56 24.26 3.75 8.05 12 13.25 21.01 13.25H160v24.45l-30.29 48.4c-5.32 10.64 2.42 23.16 14.31 23.16h95.96c11.89 0 19.63-12.52 14.31-23.16L224 440.45V416h136.86c9.01 0 17.26-5.2 21.01-13.25 3.8-8.17 2.44-17.47-3.56-24.26z"></path></svg>',
    'rain-1': '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M4.158 12.025a.5.5 0 0 1 .316.633l-.5 1.5a.5.5 0 1 1-.948-.316l.5-1.5a.5.5 0 0 1 .632-.317m3 0a.5.5 0 0 1 .316.633l-1 3a.5.5 0 1 1-.948-.316l1-3a.5.5 0 0 1 .632-.317m3 0a.5.5 0 0 1 .316.633l-.5 1.5a.5.5 0 1 1-.948-.316l.5-1.5a.5.5 0 0 1 .632-.317m3 0a.5.5 0 0 1 .316.633l-1 3a.5.5 0 1 1-.948-.316l1-3a.5.5 0 0 1 .632-.317m.247-6.998a5.001 5.001 0 0 0-9.499-1.004A3.5 3.5 0 1 0 3.5 11H13a3 3 0 0 0 .405-5.973"></path></svg>',
    'rain-2': '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M4.176 11.032a.5.5 0 0 1 .292.643l-1.5 4a.5.5 0 0 1-.936-.35l1.5-4a.5.5 0 0 1 .644-.293m3 0a.5.5 0 0 1 .292.643l-1.5 4a.5.5 0 0 1-.936-.35l1.5-4a.5.5 0 0 1 .644-.293m3 0a.5.5 0 0 1 .292.643l-1.5 4a.5.5 0 0 1-.936-.35l1.5-4a.5.5 0 0 1 .644-.293m3 0a.5.5 0 0 1 .292.643l-1.5 4a.5.5 0 0 1-.936-.35l1.5-4a.5.5 0 0 1 .644-.293m.229-7.005a5.001 5.001 0 0 0-9.499-1.004A3.5 3.5 0 1 0 3.5 10H13a3 3 0 0 0 .405-5.973"></path></svg>',
    window: '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M12 3c-3.866 0 -7 3.272 -7 7v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1 -1v-10c0 -3.728 -3.134 -7 -7 -7z"></path><path d="M5 13l14 0"></path><path d="M12 3l0 18"></path></svg>',
    umbrella: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M8 0a.5.5 0 0 1 .5.5v.514C12.625 1.238 16 4.22 16 8c0 0 0 .5-.5.5-.149 0-.352-.145-.352-.145l-.004-.004-.025-.023a3.5 3.5 0 0 0-.555-.394A3.17 3.17 0 0 0 13 7.5c-.638 0-1.178.213-1.564.434a3.5 3.5 0 0 0-.555.394l-.025.023-.003.003s-.204.146-.353.146-.352-.145-.352-.145l-.004-.004-.025-.023a3.5 3.5 0 0 0-.555-.394 3.3 3.3 0 0 0-1.064-.39V13.5H8h.5v.039l-.005.083a3 3 0 0 1-.298 1.102 2.26 2.26 0 0 1-.763.88C7.06 15.851 6.587 16 6 16s-1.061-.148-1.434-.396a2.26 2.26 0 0 1-.763-.88 3 3 0 0 1-.302-1.185v-.025l-.001-.009v-.003s0-.002.5-.002h-.5V13a.5.5 0 0 1 1 0v.506l.003.044a2 2 0 0 0 .195.726c.095.191.23.367.423.495.19.127.466.229.879.229s.689-.102.879-.229c.193-.128.328-.304.424-.495a2 2 0 0 0 .197-.77V7.544a3.3 3.3 0 0 0-1.064.39 3.5 3.5 0 0 0-.58.417l-.004.004S5.65 8.5 5.5 8.5s-.352-.145-.352-.145l-.004-.004a3.5 3.5 0 0 0-.58-.417A3.17 3.17 0 0 0 3 7.5c-.638 0-1.177.213-1.564.434a3.5 3.5 0 0 0-.58.417l-.004.004S.65 8.5.5 8.5C0 8.5 0 8 0 8c0-3.78 3.375-6.762 7.5-6.986V.5A.5.5 0 0 1 8 0M6.577 2.123c-2.833.5-4.99 2.458-5.474 4.854A4.1 4.1 0 0 1 3 6.5c.806 0 1.48.25 1.962.511a9.7 9.7 0 0 1 .344-2.358c.242-.868.64-1.765 1.271-2.53m-.615 4.93A4.16 4.16 0 0 1 8 6.5a4.16 4.16 0 0 1 2.038.553 8.7 8.7 0 0 0-.307-2.13C9.434 3.858 8.898 2.83 8 2.117c-.898.712-1.434 1.74-1.731 2.804a8.7 8.7 0 0 0-.307 2.131zm3.46-4.93c.631.765 1.03 1.662 1.272 2.53.233.833.328 1.66.344 2.358A4.14 4.14 0 0 1 13 6.5c.77 0 1.42.23 1.897.477-.484-2.396-2.641-4.355-5.474-4.854z"></path></svg>',
    car: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M499.99 176h-59.87l-16.64-41.6C406.38 91.63 365.57 64 319.5 64h-127c-46.06 0-86.88 27.63-103.99 70.4L71.87 176H12.01C4.2 176-1.53 183.34.37 190.91l6 24C7.7 220.25 12.5 224 18.01 224h20.07C24.65 235.73 16 252.78 16 272v48c0 16.12 6.16 30.67 16 41.93V416c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32v-32h256v32c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32v-54.07c9.84-11.25 16-25.8 16-41.93v-48c0-19.22-8.65-36.27-22.07-48H494c5.51 0 10.31-3.75 11.64-9.09l6-24c1.89-7.57-3.84-14.91-11.65-14.91zm-352.06-17.83c7.29-18.22 24.94-30.17 44.57-30.17h127c19.63 0 37.28 11.95 44.57 30.17L384 208H128l19.93-49.83zM96 319.8c-19.2 0-32-12.76-32-31.9S76.8 256 96 256s48 28.71 48 47.85-28.8 15.95-48 15.95zm320 0c-19.2 0-48 3.19-48-15.95S396.8 256 416 256s32 12.76 32 31.9-12.8 31.9-32 31.9z"></path></svg>',
    'leaf-rain': '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M546.2 9.7c-5.6-12.5-21.6-13-28.3-1.2C486.9 62.4 431.4 96 368 96h-80C182 96 96 182 96 288c0 7 .8 13.7 1.5 20.5C161.3 262.8 253.4 224 384 224c8.8 0 16 7.2 16 16s-7.2 16-16 16C132.6 256 26 410.1 2.4 468c-6.6 16.3 1.2 34.9 17.5 41.6 16.4 6.8 35-1.1 41.8-17.3 1.5-3.6 20.9-47.9 71.9-90.6 32.4 43.9 94 85.8 174.9 77.2C465.5 467.5 576 326.7 576 154.3c0-50.2-10.8-102.2-29.8-144.6z"></path></svg>',
    tent: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 640 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M624 448h-24.68L359.54 117.75l53.41-73.55c5.19-7.15 3.61-17.16-3.54-22.35l-25.9-18.79c-7.15-5.19-17.15-3.61-22.35 3.55L320 63.3 278.83 6.6c-5.19-7.15-15.2-8.74-22.35-3.55l-25.88 18.8c-7.15 5.19-8.74 15.2-3.54 22.35l53.41 73.55L40.68 448H16c-8.84 0-16 7.16-16 16v32c0 8.84 7.16 16 16 16h608c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16zM320 288l116.36 160H203.64L320 288z"></path></svg>',
    thunder: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M2.658 11.026a.5.5 0 0 1 .316.632l-.5 1.5a.5.5 0 1 1-.948-.316l.5-1.5a.5.5 0 0 1 .632-.316m9.5 0a.5.5 0 0 1 .316.632l-.5 1.5a.5.5 0 0 1-.948-.316l.5-1.5a.5.5 0 0 1 .632-.316m-7.5 1.5a.5.5 0 0 1 .316.632l-.5 1.5a.5.5 0 1 1-.948-.316l.5-1.5a.5.5 0 0 1 .632-.316m9.5 0a.5.5 0 0 1 .316.632l-.5 1.5a.5.5 0 0 1-.948-.316l.5-1.5a.5.5 0 0 1 .632-.316m-7.105-1.25A.5.5 0 0 1 7.5 11h1a.5.5 0 0 1 .474.658l-.28.842H9.5a.5.5 0 0 1 .39.812l-2 2.5a.5.5 0 0 1-.875-.433L7.36 14H6.5a.5.5 0 0 1-.447-.724zm6.352-7.249a5.001 5.001 0 0 0-9.499-1.004A3.5 3.5 0 1 0 3.5 10H13a3 3 0 0 0 .405-5.973"></path></svg>',
    bird: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M139.7 23.52c-9.1 30.54-16.5 61.64-12.7 91.58 4.2 32.7 21 64.9 65.7 95.7-53.6 74.8-86.1 204.4-59.3 277.7 10.9-54 14.2-97.8 53.5-144.6 77.5-25.6 123.9-37.6 140.3-125.7 6.2-14.7 12.6-19.3 31.9-24.7 10.6-2.9 22.2-7.5 22.1-19.2-.2-49.3-28.3-68.4-57.6-67.9-29.4.5-60 20.6-65.4 49.8-6 1.8-11.9 4.5-17.7 8-62.9-43.7-82.1-85.86-100.8-140.68zM32.03 107c10.8 27.2 26.44 54.6 49.2 76.1 24.27 22.9 56.47 39.3 100.87 42.2-34.5-24.2-54.8-50.3-65.2-77.2-29.4-10.9-56.47-25-84.87-41.1zm300.07 26.3a12.24 12.24 0 0 1 12.2 12.2 12.24 12.24 0 0 1-12.2 12.2 12.24 12.24 0 0 1-12.2-12.2 12.24 12.24 0 0 1 12.2-12.2zm60 56.1c-3.5 5.1-7.1 10.2-16.1 13.2 33.9 25.3 79.1 76.5 104 105-11.2-33.2-55.8-88.6-87.9-118.2z"></path></svg>',
    bee: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M273.625 17.438l3.313 19.406L258.53 40l-3.717-21.594c-11.894 1.303-21.9 3.848-30.188 7.344L238.5 43.375l-14.688 11.563-15.343-19.5c-9.837 8.29-15.64 18.988-17.657 32.156l24.375-1.344 1.03 18.656-12.812.72c36.685 31.72 70.686 71.3 102.125 122.718 3.52-.453 7.054-.697 10.564-.72 2.396-.014 4.774.055 7.156.25 3.744.31 7.462.914 11.125 1.782 10.252-71.962-6.85-130.822-38.5-191.062-7.863-.71-15.335-1.137-22.25-1.157zM78.905 27.813C72.95 32.37 67.494 36.937 62.5 41.5l18.47 17.875-13 13.406-18.657-18.03c-9.15 10.155-16.053 20.23-20.907 30.125l20.125 4.72-4.28 18.218-22.438-5.282c-.528 2.05-.986 4.073-1.343 6.095-2.264 12.796-1.332 25.318 2.593 37.47l22.968-11.19 8.157 16.814-23.53 11.436c4.11 7.18 9.307 14.198 15.562 21.063 3.188 3.5 6.67 6.913 10.405 10.28l15.125-16.28 13.688 12.75-14.25 15.31c10.718 7.82 22.952 15.15 36.562 21.814l10.47-20.125 16.56 8.624-10 19.22c9.974 4.158 20.545 7.945 31.657 11.405l6.657-19.407 17.687 6.062-6.343 18.5c10.976 2.874 22.408 5.395 34.25 7.53l3.157-19.03 18.437 3.063-3.155 18.937c22.212 3.138 45.688 4.95 70.188 5.188l-.188 18.687c-20.204-.195-39.78-1.404-58.594-3.5-1.978 7.395-3.443 15.514-4.25 24.438-99.17-72.015-189.613 29.593-213.843 140 96.828 62.17 166.47 12.61 216.094-69.844l17.532 40.125 17.125-7.5-23.156-52.97c4.207-7.892 8.265-16.012 12.157-24.28 7.755 11.174 16.53 18.968 25.688 23.655l1.03 32.97.126 4.25 3.314 2.686 38.406 31.314 11.813-14.5-35.094-28.625-.72-22.75c11.463.746 22.9-2.88 33.125-10.345l.72 26.906.186 6.19 5.783 2.25 62.28 24.092 6.75-17.437-56.468-21.813-1.094-39.625c2.924-4.387 5.622-9.2 8-14.468 14.34 60.238 86.187 63.25 103.126 7.936 11.726-38.29-19.33-72.846-52.562-72l-10.156-47.25c29.243 7.773 54.154 23.793 73.906 55.906l15.906-9.78c-25.456-41.388-61.373-60.69-100.375-67.595l-13.688-2.406 2.938 13.564 13.25 61.812c-.644.294-1.298.58-1.938.906l-.062.032c-2.39.595-4.74 1.456-7 2.656-4.883 2.592-8.73 6.348-11.625 10.78-9.013-28.358-34.47-46.61-61.406-49.31 3.698 6.412 7.374 12.98 11 19.75l-16.47 8.81C243.755 130.22 169.122 70.843 78.907 27.813zM402.282 276.75c.325-.002.638.013.97.03 2.656.148 5.576.97 8.75 2.564 6.348 3.188 13.04 9.53 17.656 18.22 4.617 8.686 6.13 17.77 5.22 24.81-.912 7.04-3.827 11.552-7.97 13.75-4.142 2.2-9.527 2.096-15.875-1.093-6.347-3.187-13.038-9.53-17.655-18.217-4.617-8.688-6.13-17.773-5.22-24.813.912-7.04 3.827-11.55 7.97-13.75 1.812-.962 3.89-1.485 6.156-1.5z"></path></svg>',
    cat: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M290.59 192c-20.18 0-106.82 1.98-162.59 85.95V192c0-52.94-43.06-96-96-96-17.67 0-32 14.33-32 32s14.33 32 32 32c17.64 0 32 14.36 32 32v256c0 35.3 28.7 64 64 64h176c8.84 0 16-7.16 16-16v-16c0-17.67-14.33-32-32-32h-32l128-96v144c0 8.84 7.16 16 16 16h32c8.84 0 16-7.16 16-16V289.86c-10.29 2.67-20.89 4.54-32 4.54-61.81 0-113.52-44.05-125.41-102.4zM448 96h-64l-64-64v134.4c0 53.02 42.98 96 96 96s96-42.98 96-96V32l-64 64zm-72 80c-8.84 0-16-7.16-16-16s7.16-16 16-16 16 7.16 16 16-7.16 16-16 16zm80 0c-8.84 0-16-7.16-16-16s7.16-16 16-16 16 7.16 16 16-7.16 16-16 16z"></path></svg>',
    rooster: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M365.852 31.858c-10.152 2.474-24.915 7.073-37.437 13.602-9.2 4.797-17.277 10.575-21.928 16.19-4.65 5.618-6.05 9.96-4.416 15.587l3.556 12.254-12.736-.76c-3.048-.183-4.944-.117-7.364-.262-2.42-.146-5.405-.706-8.27-1.87-3.86-1.568-9.082-4.65-16.085-8.91-.366 4.63-.58 10.108-.407 16.006.38 12.915 2.02 27.945 4.82 41.17 1.328 6.27 3.007 12.134 4.805 17.13 2.992-4.705 6.264-9.202 9.84-13.368 17.022-19.818 40.47-41.586 69.867-43.697 14.423-1.037 29.333 5.324 42.554 12.41 3.997-7.635 10.257-13.963 16.617-19.67 6.403-5.748 13.146-11.018 18.95-15.97-9.552-6.72-16.81-10.074-23.02-10.855-7.936-.998-16.028 1.45-28.835 8.828l-15.21 8.762 4.7-46.577zm-12.796 80.995a16.57 16.57 0 0 0-1.672.03c-20.817 1.494-41.72 19.098-57.5 37.47-13.842 16.117-23.36 41.13-28.65 61.556 6.866 1.127 14.21 2.21 21.564 2.43 10.95.33 20.46-1.593 25.334-5.83l7.04-6.114 5.862 7.25c4.956 6.128 10.802 14.087 14.32 23.476 1.78 4.75 2.88 10.128 2.698 15.607 12.487-2.64 23.93-7.162 28.884-12.86l5.256-6.043 6.614 4.52c10.006 6.838 19.827 14.582 26.634 25.236 1.033-3.752 1.935-7.666 2.416-11.75 1.503-12.738-.18-25.93-6.636-35.494-10.232-11.257-22.116-22.055-24.93-37.03-1.066-5.675.69-10.02 2.78-14.29 2.092-4.27 4.972-8.467 8.35-12.593 3.803-4.644 8.228-9.1 12.948-13.05-4.015-2.658-8.39-5.55-13.877-8.665-12.77-7.256-28.594-13.592-37.434-13.86zM48.52 128.626c-6.353-.037-9.976.466-9.976 1.576 2.82 12.857 7.998 26.53 15.432 39.48 26.005-3.718 53.01-5.705 80.652-5.488 26.75 8.66 54.68 16.02 80.83 25.338-25.477-4.52-50.737-6.842-75.512-7.3a489.987 489.987 0 0 0-11.82-.073c-28.5.16-56.26 2.772-82.938 7.17 4.785 32.48 20.097 79.06 50.397 120.476 32.95 45.036 82.958 84.022 156.976 94.457 58.185 8.202 107.473-4.926 132.47-31.346 12.5-13.21 19.395-29.548 19.23-49.768-.157-18.958-6.877-41.526-22.327-67.106-1.133-.884-2.3-1.766-3.52-2.654-13.164 10.368-31.666 13.752-47.895 15.322l-18.392 1.78 9.94-15.58c2.974-4.66 2.76-9.265.433-15.474-1.486-3.962-4.016-8.048-6.75-11.992-9.13 4.418-19.634 5.185-29.495 4.887-12.977-.392-25.546-2.913-33.66-4.262l-9.268-1.538 1.936-9.193c2.894-13.746 7.735-30.663 15.19-46.902-46.584-23.24-175.11-41.595-211.933-41.812zm303.762.088c8.852 0 16.186 7.384 16.186 16.213 0 8.83-7.334 16.213-16.186 16.213-8.85 0-16.187-7.384-16.187-16.213 0-8.83 7.336-16.213 16.187-16.213zm73.906 13.47l-1.707.936c-5.958 3.275-13.704 10.08-19.133 16.71-2.715 3.316-4.887 6.612-6.11 9.108-.885 1.807-1.032 3.154-1.13 3.35 1.295 5.8 10.486 16.914 20.966 28.522l.387.427.326.473a54.88 54.88 0 0 1 4.754 8.342c11.47.563 23.966-.753 38.652-3.727l-41.35-30.937s37.437.748 51.126-1.635c4.696-.818-25.494-22.228-46.78-31.57zM160.52 231.076l17.516 4.15c-1.628 6.866-6.334 11.36-11.355 15.008-5.02 3.65-10.874 6.607-17 9.354-5.37 2.408-10.923 4.598-16.195 6.698 17.247 7.16 39.738 12.514 57.944 7.756l8.135-2.127 2.672 7.975c2.102 6.27.8 12.92-1.97 18.097-2.766 5.176-6.815 9.438-11.452 13.343-4.408 3.713-9.428 7.075-14.636 10.11 1.512.4 2.75.78 4.413 1.185 16.154 3.923 39.21 7.99 62.21 9.678 22.997 1.688 46.086.824 61.544-4.053 7.728-2.44 13.347-5.8 16.605-9.553 3.26-3.753 4.8-7.815 4.16-14.64l17.922-1.678c1.02 10.888-2.2 20.873-8.49 28.12-6.29 7.245-15.014 11.835-24.78 14.917-19.536 6.163-44.068 6.615-68.28 4.837-24.213-1.778-47.956-5.964-65.14-10.137-8.59-2.087-15.446-4.112-20.384-6.105-2.47-.997-4.277-1.582-6.817-3.805-1.27-1.112-3.838-3.195-3.59-8.084.122-2.444 1.414-4.847 2.696-6.168 1.28-1.32 2.438-1.895 3.368-2.295 9.76-4.196 20.562-10.17 27.602-16.098a41.493 41.493 0 0 0 3.95-3.828c-28.726 2.026-57.113-10.163-73.773-20.45l-13.646-8.425 14.302-7.258c9.833-4.99 23.145-9.453 34.26-14.44 5.56-2.492 10.508-5.107 13.787-7.49 3.277-2.38 4.37-4.38 4.42-4.597zM132.378 373.31c-9.94 10.178-24.66 20.105-40.18 28.05-6.34-7.936-13.154-15.46-20.445-22.242L59.495 392.3c5.485 5.1 10.75 10.778 15.762 16.814-5.725 2.31-11.364 4.275-16.715 5.793l4.914 17.315c6.655-1.89 13.604-4.25 20.605-7.035-.004 16.89-1.79 35.74-6.532 48.816l16.92 6.14c3.645-10.05 5.755-21.453 6.826-32.9 4.775 8.44 9.016 16.875 12.606 24.934l16.443-7.326c-6.96-15.626-16.04-32.46-26.976-48.42 16.785-8.633 32.574-19.633 43.97-32.488a244.225 244.225 0 0 1-14.94-10.632zm301.435 35.127c-15.158.19-32.163 7.857-49.21 18.494a196.634 196.634 0 0 0-20.456 14.66c-6.71-5.158-13.73-10.692-20.86-16.23a1086.232 1086.232 0 0 0-7.88-6.062c-7.882 1.91-16.138 3.324-24.705 4.232 7.053 4.96 14.317 10.433 21.545 16.047 6.184 4.802 12.332 9.672 18.37 14.354-4.958 5.056-9.45 10.33-13.243 15.735l14.734 10.34c3.507-4.998 7.984-10.123 13.076-15.117 5.09 3.68 10.056 7.083 14.82 9.965l9.317-15.4a143.322 143.322 0 0 1-4.667-2.96c19.407-2.33 39.054-.35 52.653 2.676l3.91-17.57c-10.58-2.356-23.95-4.223-38.416-4.275l-.19.002c13.615-7.218 26.607-11.223 33.21-10.857l1-17.97a44.232 44.232 0 0 0-3.007-.063z"></path></svg>',
    cow: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M468.958 108.958c-27.507 2.08-48.997 7.94-71.375 22.572-5.333-2.214-12.62-17.738-16-16-11.82 6.08-14.892 19.555-4.916 32.817l-59.084 9.916c-24.776 3.341-49.567 4.838-74.187 5.334 1.326 3.832 2.96 7.636 4.812 10.05 5.219 6.802 20.323 6.21 21.07 14.75 1.935 22.098-24.876 47.415-47.056 47.057-15.401-.248-17.017-28.762-31.604-33.713-19.097-6.482-41.62 18.77-59.699 9.832-15.267-7.547-24.992-39.8-27.836-50.41-10.213-.127-20.327-.142-30.316.035-12.564.366-22.902 5.645-29.408 14.239-8.676 11.458-11.652 26.658-13.254 42.925-1.78 18.057 6.147 53.007 5.517 70.282-.504 13.85-7.493 11.87-11.912 18.888-13.52 21.47 8.894 20.83 17.014 5.56 12.482-23.473 4.253-63.11 7.195-92.974 1.855-35.76 10.597-23.937 15.664-24.588-4.2 13.065-6.21 30.962-7 51.334 6.895-2.342 36.498-11.6 42.73-.174 6.872 12.598-27.802 22.016-23.878 35.819 2.464 8.666 22.95 2.378 24.582 11.238 3.322 18.035-32.13 38.713-42.236 44.209.812 23.329 1.564 45.567 1.238 65.086H88.91c-4.234-16.543-12.038-49.944-4.06-55.084 21.425-18.091 29.836-37.484 42.732-56.428 8.755 2.556 16.92 4.787 24.782 6.672 3.553.972 7.244 1.771 10.984 2.44 24.859 4.967 61.553 5.678 90.783-.172 3.76 34.12 7.263 68.452 4.602 102.572h28.957c-12.375-26.902-4.263-65.044 13.892-86.27l44.934-33.462c24.881-16.384 42.93-37.996 55.982-63.38 30.402 3.413 57.086 3.29 77.192-.786l12.84-19.55c-24.257-17.857-43.3-36.585-62.948-58.13 10.063-14.533 25.027-22.765 39.375-32.506zm-39.375 54.572a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM366.2 183.481c5.029 9.822-26.17 10.808-24.933 21.772.998 8.847 22.204 3.839 23.53 12.643 3.818 25.373-28.44 53.805-54.08 54.78-14.262.544-34.902-14.06-32.308-28.093 2.605-14.092 34.551-1.657 40.383-14.748 4.724-10.603-18.352-22.01-12.992-32.307 6.264-12.032 30.364-22.553 41.934-22.646 11.57-.093 15.606 3.347 18.466 8.6zm-26.585 126.346l-34.707 23.96 6.464 69.255h34.414c-11.783-22.454-15.58-55.506-6.171-93.215zm-204.561 1.41c-6.047 12.184-14.147 21.97-22.174 31.242 5.97 3.235 11.648 5.414 17.154 6.614 11.218 2.443 21.636.333 29.948-4.408 10.056-5.737 17.521-14.452 24.115-23.368-14.615-.869-32.96-2.962-49.043-10.08zm24.252 52c-8.737 2.585-17.452 3.7-25.566 2.96 5.167 12.624 10.45 24.152 15.824 36.845h28.306c-10.393-18.48-16.148-29.285-18.564-39.805z"></path></svg>',
    cricket: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M335.7 88.94c-4.742.194-9.563 1.486-14.204 4.165-38.934 22.48-89.77 21.953-127.79.002-6.09-3.516-12.285-4.61-18.145-3.892 5.914 7.778 9.438 17.572 9.438 28.09 0 23.15-17.037 42.83-39.176 45.095-12.775 14.92-21.553 31.807-24.386 49.983 44.73-23.79 90.947-35.572 137.064-35.508 46.15.064 92.197 11.987 136.56 35.62-2.69-18.15-11.216-35.043-23.794-49.92-.585.026-1.17.048-1.76.048-24.18 0-43.447-20.7-43.447-45.318 0-10.64 3.6-20.543 9.64-28.364zm-194.15 3.216c-12.67 0-23.277 10.85-23.277 25.15 0 14.297 10.608 25.147 23.278 25.147 12.67 0 23.276-10.85 23.276-25.148s-10.606-25.15-23.275-25.15zm227.956 0c-12.67 0-23.277 10.85-23.277 25.15 0 14.297 10.607 25.147 23.276 25.147 12.67 0 23.277-10.85 23.277-25.148s-10.608-25.15-23.277-25.15zm67.572 93.367c-8.525.088-17.893 1.546-27.853 4.243 6.926 19.457 8.57 40.725 2.695 62.656-4.26 15.896.933 37.475 11.7 54.758l4.69 7.53-7.02 5.43c-19.765 15.28-36.44 25.107-46.104 35.264-9.664 10.158-13.887 19.59-10.915 40.875l1.525 10.91c3.596 4.7 7.678 9.43 12.142 14.06 19.876-14.55 36.01-23.887 68.344-4.094-6.738-18.804 15.938-29.762 46.72-29.78-36.91-15.88-64.98-25.62-86.438-30.376 67.492-72.188 97.182-127.96 66-159.188-8.172-8.183-19.356-12.034-33.28-12.28-.73-.014-1.463-.016-2.204-.01zm-361.617.002c-.806-.01-1.606-.008-2.397.006-13.925.248-25.14 4.1-33.313 12.282-31.182 31.227-1.492 87 66 159.188-21.456 4.756-49.528 14.497-86.438 30.375 30.782.02 53.458 10.977 46.72 29.78 32.332-19.792 48.468-10.454 68.343 4.095 6.713-6.962 12.572-14.146 17.188-21.12l.537-3.85c2.972-21.283-1.25-30.716-10.914-40.874-9.664-10.157-26.34-19.984-46.106-35.265l-7.02-5.427 4.692-7.53c10.73-17.228 15.858-39.233 11.7-54.76-5.782-21.572-4.185-42.44 2.536-61.56-11.336-3.388-21.954-5.216-31.527-5.338zm183.038 9.66c-46.096-.065-92.3 12.827-137.574 38.846.47 4.387 1.292 8.825 2.494 13.31v.002c5.453 20.354.593 42.93-9.484 62.297 15.89 11.634 30.343 20.526 41.478 32.23 10.36 10.89 16.795 25.132 16.955 43.712-1.096 16.308-9.157 39.273-22.347 59.244 24.59-14.237 42.134-15.333 45.29 3.492 14.097-17.783 25.698-20.386 38.985-8.035-3.745-31.452-11.117-52.887-17.258-65.097-14.896-36.567-42.816-61.484-73.742-83.424l11.36-16.014c38.788 27.517 76.798 62.663 89.124 119.566 9.628.705 19.25.65 28.85-.16 12.362-56.81 50.334-91.918 89.085-119.408l11.36 16.016c-31.19 22.127-59.333 47.28-74.13 84.363-6.045 12.357-13.14 33.493-16.793 64.158 13.29-12.35 24.89-9.748 38.987 8.035 3.153-18.825 20.697-17.73 45.288-3.492-13.51-20.455-21.645-44.058-22.42-60.424.415-18.01 6.81-31.872 16.95-42.533 11.135-11.705 25.586-20.595 41.474-32.23-10.064-19.29-14.99-41.736-9.48-62.302 1.198-4.467 2.028-8.89 2.51-13.266-44.85-25.79-90.852-38.82-136.964-38.886z"></path></svg>',
    crow: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 640 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M544 32h-16.36C513.04 12.68 490.09 0 464 0c-44.18 0-80 35.82-80 80v20.98L12.09 393.57A30.216 30.216 0 0 0 0 417.74c0 22.46 23.64 37.07 43.73 27.03L165.27 384h96.49l44.41 120.1c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38L312.94 384H352c1.91 0 3.76-.23 5.66-.29l44.51 120.38c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38l-41.24-111.53C485.74 352.8 544 279.26 544 192v-80l96-16c0-35.35-42.98-64-96-64zm-80 72c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"></path></svg>',
    dog: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M298.06,224,448,277.55V496a16,16,0,0,1-16,16H368a16,16,0,0,1-16-16V384H192V496a16,16,0,0,1-16,16H112a16,16,0,0,1-16-16V282.09C58.84,268.84,32,233.66,32,192a32,32,0,0,1,64,0,32.06,32.06,0,0,0,32,32ZM544,112v32a64,64,0,0,1-64,64H448v35.58L320,197.87V48c0-14.25,17.22-21.39,27.31-11.31L374.59,64h53.63c10.91,0,23.75,7.92,28.62,17.69L464,96h64A16,16,0,0,1,544,112Zm-112,0a16,16,0,1,0-16,16A16,16,0,0,0,432,112Z"></path></svg>',
    frog: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M335.7 88.94c-4.742.194-9.563 1.486-14.204 4.165-38.934 22.48-89.77 21.953-127.79.002-6.09-3.516-12.285-4.61-18.145-3.892 5.914 7.778 9.438 17.572 9.438 28.09 0 23.15-17.037 42.83-39.176 45.095-12.775 14.92-21.553 31.807-24.386 49.983 44.73-23.79 90.947-35.572 137.064-35.508 46.15.064 92.197 11.987 136.56 35.62-2.69-18.15-11.216-35.043-23.794-49.92-.585.026-1.17.048-1.76.048-24.18 0-43.447-20.7-43.447-45.318 0-10.64 3.6-20.543 9.64-28.364zm-194.15 3.216c-12.67 0-23.277 10.85-23.277 25.15 0 14.297 10.608 25.147 23.278 25.147 12.67 0 23.276-10.85 23.276-25.148s-10.606-25.15-23.275-25.15zm227.956 0c-12.67 0-23.277 10.85-23.277 25.15 0 14.297 10.607 25.147 23.276 25.147 12.67 0 23.277-10.85 23.277-25.148s-10.608-25.15-23.277-25.15zm67.572 93.367c-8.525.088-17.893 1.546-27.853 4.243 6.926 19.457 8.57 40.725 2.695 62.656-4.26 15.896.933 37.475 11.7 54.758l4.69 7.53-7.02 5.43c-19.765 15.28-36.44 25.107-46.104 35.264-9.664 10.158-13.887 19.59-10.915 40.875l1.525 10.91c3.596 4.7 7.678 9.43 12.142 14.06 19.876-14.55 36.01-23.887 68.344-4.094-6.738-18.804 15.938-29.762 46.72-29.78-36.91-15.88-64.98-25.62-86.438-30.376 67.492-72.188 97.182-127.96 66-159.188-8.172-8.183-19.356-12.034-33.28-12.28-.73-.014-1.463-.016-2.204-.01zm-361.617.002c-.806-.01-1.606-.008-2.397.006-13.925.248-25.14 4.1-33.313 12.282-31.182 31.227-1.492 87 66 159.188-21.456 4.756-49.528 14.497-86.438 30.375 30.782.02 53.458 10.977 46.72 29.78 32.332-19.792 48.468-10.454 68.343 4.095 6.713-6.962 12.572-14.146 17.188-21.12l.537-3.85c2.972-21.283-1.25-30.716-10.914-40.874-9.664-10.157-26.34-19.984-46.106-35.265l-7.02-5.427 4.692-7.53c10.73-17.228 15.858-39.233 11.7-54.76-5.782-21.572-4.185-42.44 2.536-61.56-11.336-3.388-21.954-5.216-31.527-5.338zm183.038 9.66c-46.096-.065-92.3 12.827-137.574 38.846.47 4.387 1.292 8.825 2.494 13.31v.002c5.453 20.354.593 42.93-9.484 62.297 15.89 11.634 30.343 20.526 41.478 32.23 10.36 10.89 16.795 25.132 16.955 43.712-1.096 16.308-9.157 39.273-22.347 59.244 24.59-14.237 42.134-15.333 45.29 3.492 14.097-17.783 25.698-20.386 38.985-8.035-3.745-31.452-11.117-52.887-17.258-65.097-14.896-36.567-42.816-61.484-73.742-83.424l11.36-16.014c38.788 27.517 76.798 62.663 89.124 119.566 9.628.705 19.25.65 28.85-.16 12.362-56.81 50.334-91.918 89.085-119.408l11.36 16.016c-31.19 22.127-59.333 47.28-74.13 84.363-6.045 12.357-13.14 33.493-16.793 64.158 13.29-12.35 24.89-9.748 38.987 8.035 3.153-18.825 20.697-17.73 45.288-3.492-13.51-20.455-21.645-44.058-22.42-60.424.415-18.01 6.81-31.872 16.95-42.533 11.135-11.705 25.586-20.595 41.474-32.23-10.064-19.29-14.99-41.736-9.48-62.302 1.198-4.467 2.028-8.89 2.51-13.266-44.85-25.79-90.852-38.82-136.964-38.886z"></path></svg>',
    horse: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M400 16c-21.335 9.73-58.244 17.34-73.086 48.232-22.36 1.948-72.753 10.673-122.22 40.25-58.098 34.74-116.017 97.417-131.776 213.702l-.48 3.537-2.774 2.25c-30.87 25.002-40.657 38.937-44.416 61.153-3.536 20.9-.72 51.46-.363 101.877H328.36c3.455-16.892 10.44-29.245 12.472-41.568 2.337-14.176.19-29.938-20.812-58.547-43.078-58.683-46.853-129.458-12.916-171.28-8.654-2.765-15.09-6.887-19.458-12.546-6.115-7.924-7.4-17.006-8.57-25.884l17.848-2.352c1.112 8.446 2.38 13.88 4.97 17.237 2.59 3.356 7.31 6.472 19.55 8.46l-.022.128.172-.17 5.998 9.424c19.957 31.358 42.84 51.292 73.332 54.44l6.51.672 1.367 6.4c2.74 12.828 8.626 19.095 15.116 22.238 6.49 3.143 14.225 2.944 20.47.205 9.316-4.086 14.518-11.35 16.7-22.712 2.122-11.05.546-25.834-5.137-42.106-33.538-38.248-44.475-87.277-63.903-128.772-6.055-9.947-12.448-18.518-20.385-24.856C376.808 55.126 386.456 34.852 400 16zM214.068 34.97C179.55 35.06 146.075 43.06 96 58.58c31.146 9.92 70.397 18.9 86.037 39.01 4.463-3.017 8.94-5.88 13.418-8.56 40.51-24.22 80.387-35.286 108.23-40.04-35.854-9.477-63.047-14.094-89.617-14.023zM157.16 96.712c-1.13-.01-2.265-.01-3.402.004-30.353.37-63.1 9.745-96.647 31.283 27.186 3.672 54.67 3.724 72.58 15.398 15.9-17.92 33.144-32.634 50.677-44.668-7.548-1.244-15.292-1.938-23.207-2.017zM368 128a13.214 13.215 0 0 1 13.213 13.215A13.214 13.215 0 0 1 368 154.432a13.214 13.215 0 0 1-13.213-13.217A13.214 13.215 0 0 1 368 128zm-238.906 16.068c-36.395 1.495-68.903 6.53-104.76 24.766 33.236 7.095 50.913 13.507 65.025 33.83 11.522-22.53 25.045-41.93 39.734-58.596zM74.518 201.46C53.53 201.65 36.614 213.14 16 224c27.854 0 46.067 3.862 58.71 12.055 4.33-11.652 9.16-22.615 14.41-32.924-5.12-1.19-9.963-1.71-14.602-1.67zm-.623 36.82c-17.933 5.845-35.452 7.15-54.23 22.284 17.62 4.638 34.79 9.596 41.398 22.034 3.496-15.77 7.814-30.523 12.832-44.32zm370.142 8.57c1.617-.035 3.222.044 4.783.187l-1.64 17.926c-3.928-.36-5.513.416-5.57.465-.058.048-1.035.656-.635 5.886l-17.95 1.372c-.638-8.35 1.297-16.207 6.955-20.997 4.245-3.593 9.206-4.735 14.057-4.84zM52.215 290.723c-10.352.13-23.76 5.646-34.656 12.334 12.173 6.83 12.357 23.472 8.938 37.668 7.3-9.105 16.855-18.323 29.158-28.48 1.016-7.043 2.19-13.9 3.506-20.585-2.082-.67-4.42-.97-6.947-.937z"></path></svg>',
    owl: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M70.574 17.27l-4.87 18.044c24.228 6.543 46.02 15.573 65.478 26.704-21.276 15.76-35.307 42.705-35.307 73.314 0 13.593 2.77 26.463 7.707 37.955-21.82 20.365-35.004 49.398-35.004 87.504 0 70.68 42.857 131.724 104.85 161.005l-30.71 70.36h20.376l27.594-63.216c3.01 1.077 6.05 2.09 9.13 3.02 3.56 2.76 7.186 5.25 10.868 7.487l-13.03 52.71h19.28l10.945-44.32c6.856 2.546 13.842 4.224 20.9 5.007v39.312h18.69V452.8c7.872-.906 15.65-2.936 23.255-6.056l11.212 45.412h19.25l-13.44-54.418c3.4-2.222 6.75-4.66 10.036-7.343 3.22-1.07 6.398-2.226 9.537-3.456l28.46 65.216h20.376l-31.8-72.863c59.226-30.165 99.74-89.782 99.74-158.502 0-37.114-12.51-65.62-33.32-85.897 5.383-11.896 8.435-25.327 8.435-39.56 0-30.5-13.928-57.36-35.073-73.144 19.638-11.334 41.452-20.41 65.396-26.876l-4.87-18.043c-26.26 7.092-50.213 17.245-71.75 30-34.084-18.84-77.19-28.164-120.214-28.114-40.908.048-81.73 8.575-114.655 25.448-20.227-11.394-42.7-20.644-67.47-27.333zM252.707 38.67c36.446-.044 72.955 6.705 102.084 20.348-45.112 31.892-77.918 76.2-97.15 127.79C238.314 134.672 205 88.95 157.073 56.388c27.807-11.744 61.69-17.68 95.635-17.722zm-83.605 68.373c19.4 0 35.33 15.923 35.33 35.32 0 19.4-15.93 35.324-35.33 35.324S133.77 161.76 133.77 142.36c0-19.398 15.932-35.32 35.332-35.32zm179.44 0c19.4 0 35.33 15.923 35.33 35.32 0 19.4-15.93 35.324-35.33 35.324-19.402 0-35.333-15.923-35.333-35.323 0-19.398 15.93-35.32 35.33-35.32zm-110.378 80.69c4.052 10.347 7.523 21 10.424 31.913l9.03 33.964 9.03-33.964c2.895-10.888 6.368-21.472 10.405-31.72 14.39 21.47 37.346 35.386 63.236 35.386 14.44 0 27.964-4.346 39.608-11.896-4.003 70.85-18.94 124.726-39.34 161.416-23.964 43.104-54.35 62.274-83.537 61.836-29.184-.438-59.806-20.672-83.803-64.074-20.432-36.954-35.36-90.513-39.354-160.03C145.8 218.65 159.81 223.31 174.8 223.31c25.967 0 48.984-14 63.364-35.58zm-125.266 2.147c.433.61.864 1.22 1.31 1.816 2.165 81.335 18.39 144.056 42.653 187.942 3.655 6.61 7.513 12.784 11.538 18.55-48.72-28.262-81.132-79.294-81.132-137.394 0-32.026 9.226-54.484 25.632-70.913zm288.282 1.428c15.53 16.296 24.226 38.38 24.226 69.486 0 56.37-30.516 106.083-76.828 134.804 2.87-4.334 5.65-8.887 8.315-13.682 24.163-43.46 40.328-106.15 42.628-188.473.56-.707 1.122-1.41 1.66-2.135zm-237.496 59.052c-3.753 6.263-6.096 14.53-6.096 23.24 0 20.065 12.095 35.915 26.82 35.915 12.53 0 23.354-11.585 26.21-27.465-4.692 4.098-10.472 6.34-16.456 6.34-15.98 0-29.423-16.616-30.478-38.03zm185.912 2.477c-1.056 21.413-14.496 38.03-30.477 38.03-5.985 0-11.763-2.242-16.458-6.34 2.858 15.88 13.68 27.466 26.21 27.466 14.726 0 26.21-15.85 26.21-35.916 0-8.71-1.732-16.977-5.484-23.24h-.002zm-68.73 28.97c-3.51 13.094-14.307 23.18-24.53 23.18-9.984 0-20.61-10.057-23.943-22.507-.813 3.397-1.752 7.03-1.752 10.796 0 19.225 11.59 34.41 25.698 34.41s25.697-15.185 25.697-34.41c0-3.986-.26-7.9-1.168-11.47h-.002zm35.04 66.706c-3.435 16.552-14.208 29.013-27.45 29.013-8.24 0-15.752-4.6-21.024-12.146.738 18.326 12.065 33.062 25.697 33.062 14.107 0 25.696-15.862 25.696-35.086 0-5.407-1.303-10.277-2.92-14.844zm-115.636 1.347c-1.294 4.168-1.752 8.69-1.752 13.497 0 19.224 11.59 35.085 25.697 35.085 13.633 0 24.375-14.737 25.113-33.063-5.272 7.545-12.784 12.146-21.025 12.146-12.916 0-24.314-11.735-28.032-27.666z"></path></svg>',
    seagull: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M377 67.5c-29.1.42-59.1 23.22-68.2 91.7-1.7 12.6-8.4 24.8-18.2 36.5 7.1-3 14.1-4.8 21-4.8 5 0 9.8.9 14.5 2.9 19.1 8.4 30.9 19.7 36.4 32.5s4.3 26.1.7 37.6c-3.6 11.4-9.6 21.4-15.1 28.9-5.4 7.6-9.6 12.1-12.2 14.4-33.6 30.6-94.9 37.4-148.2 38.7-43.3 1.7-86.3-3-129.12-8.2 0 0-31.13 10-41.99 14.5 51.99 15.9 96.11 11 139.61 4.3 52 17.3 165.8 31.6 241.1-37.2 37.6-30.9 36.2-86.1 17.5-152.2l25.9-53C438 91.95 408 67.04 377 67.5zm24.9 33c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8zm57.6 14.6L442.7 145c6.2-.1 12.3-.4 16.9-1.1 13.7-3 22-8.5 35.8-8.3-6.7-11.4-19.1-17.8-35.9-20.5zm-148.6 93.6c-4.5.2-9.8 1.7-16.5 5-11.2 5.4-25.3 15.4-42.9 28.3-30.5 22.4-71.6 53.3-129.6 84.3 17.4 1.1 40.4 2.1 65.4 1.6 51.8-1.2 110.5-10.4 136.5-34.1h.1c-.1.1 4.9-5 9.6-11.5 4.7-6.5 9.8-15.1 12.5-23.8 2.8-8.8 3.3-17.3 0-25.1-3.4-7.9-10.8-16-27.1-23-1.6-.8-3.3-1.2-5-1.5-1-.1-2-.2-3-.2zm-2 173c-6.1 1.5-12.1 2.7-18 3.6v38.1c-5.8-.1-11.8 0-18 .5v-36.8c-6.1.4-12.1.5-18 .4V426c-4.3.7-8.6 1.5-13 2.5v16h104c-8-10.1-21-16.4-37-19.2z"></path></svg>',
  };

  return iconMap[icon] ?? '◦';
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

function getCategory(categoryId: MixerCategoryId): AudioMixerCategory {
  const category = audioMixerData.find((item) => item.id === categoryId);
  if (!category) {
    throw new Error(`Unknown category id: ${categoryId}`);
  }
  return category;
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
    return { embed: null, isCollapsed: false, error: '' };
  }

  if (config.platform === 'netease') {
    const id = extractFirstMatch([/playlist\?id=(\d+)/i, /playlist\/(\d+)/i, /^(\d+)$/i], rawValue);
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
    const id = extractFirstMatch([/interactive_playlist\.html\?id=(\d+)/i, /playlist\/(\d+)/i, /id=(\d+)/i, /^(\d+)$/i], rawValue);
    if (!id) {
      return {
        embed: null,
        isCollapsed: false,
        error: 'QQ音乐请输入歌单 ID，或形如 y.qq.com/.../playlist/123 的官方链接。',
      };
    }

    return {
      embed: {
        platform: 'qq',
        title: `QQ音乐歌单 #${id}`,
        embedUrl: `https://i.y.qq.com/n2/m/share/details/interactive_playlist.html?id=${id}`,
        externalUrl: `https://y.qq.com/n/ryqq/playlist/${id}`,
        height: 460,
        note: 'QQ 音乐公开 iframe 策略较严格，若被拦截可通过右上角按钮直接打开官方页面。',
      },
      isCollapsed: false,
      error: '',
    };
  }

  if (config.platform === 'apple') {
    const directEmbedMatch = rawValue.match(/^https:\/\/embed\.music\.apple\.com\/[^\s]+$/i);
    if (directEmbedMatch) {
      return {
        embed: {
          platform: 'apple',
          title: 'Apple Music Playlist',
          embedUrl: rawValue,
          externalUrl: rawValue.replace('https://embed.music.apple.com', 'https://music.apple.com'),
          height: 450,
          note: '使用 Apple Music 官方 embed 页面。',
        },
        isCollapsed: false,
        error: '',
      };
    }

    const appleMatch = rawValue.match(/^https:\/\/music\.apple\.com\/([a-z]{2}(?:-[a-z]{2})?)\/playlist\/[^/]+\/(pl\.[a-z0-9]+)/i);
    if (!appleMatch) {
      return {
        embed: null,
        isCollapsed: false,
        error: 'Apple Music 请使用完整官方分享链接，或直接粘贴 embed.music.apple.com 链接。',
      };
    }

    return {
      embed: {
        platform: 'apple',
        title: `Apple Music 歌单 ${appleMatch[2]}`,
        embedUrl: `https://embed.music.apple.com${rawValue.replace(/^https:\/\/music\.apple\.com/i, '')}`,
        externalUrl: rawValue,
        height: 450,
        note: `使用 Apple Music 官方嵌入地址，区域 storefront 为 ${appleMatch[1].toUpperCase()}。`,
      },
      isCollapsed: false,
      error: '',
    };
  }

  const kugouId = extractFirstMatch([/special\/single\/(\d+)\.html/i, /songlist\/(\d+)/i, /id=(\d+)/i, /^(\d+)$/i], rawValue);
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
    body.replaceChildren();
    toggle.textContent = '▾';
    return;
  }

  shell.classList.add('is-visible');
  shell.classList.toggle('is-collapsed', playlistEmbedState.isCollapsed);
  shell.setAttribute('aria-hidden', 'false');
  title.textContent = `${getPlaylistPlatformLabel(embed.platform)} · ${embed.title}`;
  link.href = embed.externalUrl;
  toggle.textContent = playlistEmbedState.isCollapsed ? '▸' : '▾';

  const frameWrap = document.createElement('div');
  frameWrap.className = 'fs-player-frame-wrap';

  const iframe = document.createElement('iframe');
  iframe.className = 'fs-player-iframe';
  iframe.title = embed.title;
  iframe.src = embed.embedUrl;
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  iframe.style.height = `${embed.height}px`;
  frameWrap.appendChild(iframe);

  const note = document.createElement('p');
  note.className = 'fs-player-note';
  note.textContent = embed.note;

  body.replaceChildren(frameWrap, note);
}

function resolveWeatherAudioStatusText(): string {
  const runningLabel = weatherAudioState === 'running' ? '已启动' : weatherAudioState === 'paused' ? '已暂停' : '待启动';
  if (audioConfig.sourceType === 'default') {
    return `默认白噪音 · ${runningLabel}`;
  }

  if (audioConfig.customWeatherParam.trim()) {
    return `智能天气音 · ${audioConfig.customWeatherParam.trim()} · ${runningLabel}`;
  }

  if (startupWeather) {
    const ambienceLabel = startupWeather.ambience === 'rain' ? '雨声画像' : '风声画像';
    return `${startupWeather.city} · ${ambienceLabel} · ${runningLabel}`;
  }

  return `智能天气音 · 自动定位 · ${runningLabel}`;
}

function resolveWeatherAudioButtonText(): string {
  return weatherAudioState === 'running' ? '暂停音频' : weatherAudioState === 'paused' ? '恢复音频' : '启动音频';
}

function syncWeatherAudioUI() {
  const audioModeStatus = document.getElementById('audioModeStatus');
  const audioControlBtn = document.getElementById('audioControlBtn');

  if (audioModeStatus) {
    audioModeStatus.textContent = resolveWeatherAudioStatusText();
  }

  if (audioControlBtn) {
    audioControlBtn.textContent = resolveWeatherAudioButtonText();
  }
}

function syncMixerSummaryUI() {
  const selectedCategoryLabel = document.getElementById('selectedCategoryLabel');
  const activeTrackCount = document.getElementById('activeTrackCount');
  const favoriteTrackCount = document.getElementById('favoriteTrackCount');

  if (selectedCategoryLabel) {
    selectedCategoryLabel.textContent = getCategory(selectedCategoryId).name;
  }

  if (activeTrackCount) {
    activeTrackCount.textContent = String(Array.from(trackRuntimeState.values()).filter((item) => item.isActive).length);
  }

  if (favoriteTrackCount) {
    favoriteTrackCount.textContent = String(Array.from(trackRuntimeState.values()).filter((item) => item.isFavorite).length);
  }
}

function syncPermissionUI() {
  const banner = document.getElementById('permissionBanner');
  const title = document.getElementById('permissionBannerTitle');
  const message = document.getElementById('permissionBannerMessage');
  const accessibilityButton = document.getElementById('requestAccessibilityBtn') as HTMLButtonElement | null;
  const inputButton = document.getElementById('openInputMonitoringBtn') as HTMLButtonElement | null;
  const refreshButton = document.getElementById('refreshPermissionBtn') as HTMLButtonElement | null;

  if (!banner || !title || !message || !accessibilityButton || !inputButton || !refreshButton) {
    return;
  }

  if (!permissionStatus || permissionStatus.platform !== 'macos' || !permissionStatus.shouldShowGuidance) {
    banner.hidden = true;
    return;
  }

  const shouldShowBanner = !permissionStatus.accessibilityGranted || !permissionStatus.inputMonitoringGranted;
  banner.hidden = !shouldShowBanner;
  if (!shouldShowBanner) {
    return;
  }

  title.textContent = '需要开启键盘监听所需权限';
  message.textContent = permissionStatus.message;
  accessibilityButton.textContent = permissionStatus.accessibilityGranted ? '打开辅助功能' : '授权辅助功能';
  accessibilityButton.classList.toggle('is-primary', !permissionStatus.accessibilityGranted);
  inputButton.textContent = permissionStatus.inputMonitoringGranted ? '输入监控已开启' : '打开输入监控';
  inputButton.toggleAttribute('disabled', permissionStatus.inputMonitoringGranted);
  refreshButton.textContent = '刷新状态';
}

function renderLocationPermissionLabel(state: LocationPermissionState): string {
  switch (state) {
    case 'authorized':
      return '已授权';
    case 'notDetermined':
      return '未申请';
    case 'denied':
      return '已拒绝';
    case 'restricted':
      return '系统限制';
    case 'systemDisabled':
      return '系统关闭';
    case 'unavailable':
      return '不可用';
    default:
      return '未知';
  }
}

function setupPermissionChangeListener() {
  const permManager = audioManager.getPermissionManager();
  permManager.listenForPermissionChanges(() => {
    syncSettingsUI();
  });
}

function syncSettingsUI() {
  const defaultRadio = document.querySelector<HTMLInputElement>('input[name="audioSourceType"][value="default"]');
  const weatherRadio = document.querySelector<HTMLInputElement>('input[name="audioSourceType"][value="weather"]');
  const customWeatherInput = document.getElementById('customWeatherInput') as HTMLInputElement | null;
  const weatherPanelHint = document.getElementById('weatherPanelHint');
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
      const resolvedLabelMap: Record<StartupWeather['resolvedWeatherKind'], string> = {
        clear: '晴朗',
        cloudy: '多云',
        fog: '雾天',
        wind: '风天',
        rain: '雨天',
        snow: '雪天',
        storm: '暴风雨',
      };
      const resolvedLabel = resolvedLabelMap[startupWeather.resolvedWeatherKind];
      const errorSuffix = startupWeather.errors.length ? ` · 降级提示：${startupWeather.errors[0]}` : '';
      const permLabel = renderLocationPermissionLabel(startupWeather.permissionState);
      weatherPanelHint.textContent = `当前定位：${startupWeather.formattedAddress} · 天气映射：${resolvedLabel} · 权限：${permLabel}${errorSuffix}`;
    } else {
      weatherPanelHint.textContent = '当前定位未加载，留空时将继续使用系统默认天气画像。';
    }
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
  syncWeatherAudioUI();
  syncMixerSummaryUI();
  syncPermissionUI();
}

function renderCategoryNav() {
  const nav = document.getElementById('categoryNav');
  if (!nav) {
    return;
  }

  nav.innerHTML = audioMixerData
    .map((category) => `
      <button
        class="fs-category-button ${category.id === selectedCategoryId ? 'is-active' : ''}"
        type="button"
        data-category-id="${category.id}"
      >
        <span class="fs-category-icon">${getIconGlyph(category.icon)}</span>
        <span class="fs-category-text">
          <span class="fs-category-name">${category.name}</span>
          <span class="fs-category-count">${category.tracks.length} Tracks</span>
        </span>
      </button>
    `)
    .join('');
}

function getTrackStatusText(track: AudioMixerTrackWithCategory, state: TrackRuntimeState): string {
  if (!track.src) {
    return 'Source Pending';
  }

  if (state.isActive) {
    return state.element && !state.element.paused ? 'Now Playing' : 'Armed';
  }

  return 'Tap To Layer';
}

function getSliderProgressStyle(volumePercent: number): string {
  const clamped = Math.max(0, Math.min(100, volumePercent));
  return `--slider-progress: ${clamped}%;`;
}

function updateTrackVolumeUI(trackId: string, volumePercent: number) {
  const slider = document.querySelector<HTMLInputElement>(`[data-track-volume="${trackId}"]`);
  const label = document.querySelector<HTMLElement>(`[data-track-volume-label="${trackId}"]`);
  const clamped = Math.max(0, Math.min(100, Math.round(volumePercent)));

  if (slider) {
    slider.value = String(clamped);
    slider.style.setProperty('--slider-progress', `${clamped}%`);
  }

  if (label) {
    label.textContent = `${clamped}%`;
  }
}

function renderMixerGrid() {
  const grid = document.getElementById('mixerGrid');
  if (!grid) {
    return;
  }

  const category = getCategory(selectedCategoryId);
  grid.innerHTML = category.tracks
    .map((track) => {
      const runtime = getTrackRuntimeState(track.id);
      const unavailableClass = track.src ? '' : 'is-unavailable';
      const activeClass = runtime.isActive ? 'is-active' : '';
      const favoriteClass = runtime.isFavorite ? 'is-favorite' : '';
      const volume = Math.round(runtime.volume * 100);
      const badgeText = track.src ? (runtime.isActive ? 'Active' : 'Ready') : 'Reserved';
      const canAdjustVolume = Boolean(track.src) && runtime.isActive;

      return `
        <article
          class="fs-track-card ${activeClass} ${unavailableClass}"
          data-track-id="${track.id}"
        >
          <div class="fs-track-top">
            <div class="fs-track-badge">${badgeText}</div>
            <button
              class="fs-track-favorite ${favoriteClass}"
              type="button"
              data-track-favorite="${track.id}"
              aria-label="收藏 ${track.name}"
            >
              ${runtime.isFavorite ? '♥' : '♡'}
            </button>
          </div>
          <div class="fs-track-body">
            <div class="fs-track-toggle">${getIconGlyph(track.icon)}</div>
            <div>
              <p class="fs-track-name">${track.name}</p>
              <p class="fs-track-status">${getTrackStatusText({ ...track, categoryId: category.id }, runtime)}</p>
            </div>
          </div>
          <div class="fs-track-slider-wrap">
            <div class="fs-track-slider-meta">
              <span>Volume</span>
              <span data-track-volume-label="${track.id}">${volume}%</span>
            </div>
            <input
              class="fs-track-slider"
              type="range"
              min="0"
              max="100"
              value="${volume}"
              style="${getSliderProgressStyle(volume)}"
              data-track-volume="${track.id}"
              ${canAdjustVolume ? '' : 'disabled'}
            />
          </div>
        </article>
      `;
    })
    .join('');

  syncMixerSummaryUI();
}

function getTrackById(trackId: string): AudioMixerTrackWithCategory {
  const track = mixerTracks.find((item) => item.id === trackId);
  if (!track) {
    throw new Error(`Unknown track id: ${trackId}`);
  }
  return track;
}

function ensureTrackAudioElement(track: AudioMixerTrackWithCategory): HTMLAudioElement | null {
  if (!track.src) {
    return null;
  }

  const runtime = getTrackRuntimeState(track.id);
  if (!runtime.element) {
    const element = new Audio(track.src);
    element.loop = true;
    element.preload = 'auto';
    element.volume = runtime.volume;
    runtime.element = element;
  }

  return runtime.element;
}

async function playTrack(trackId: string) {
  const track = getTrackById(trackId);
  const element = ensureTrackAudioElement(track);
  if (!element) {
    return;
  }

  const runtime = getTrackRuntimeState(trackId);
  element.volume = runtime.volume;

  try {
    await element.play();
  } catch (error) {
    console.error(`❌ Track play failed: ${trackId}`, error);
  }
}

function stopTrack(trackId: string) {
  const runtime = getTrackRuntimeState(trackId);
  runtime.element?.pause();
  if (runtime.element) {
    runtime.element.currentTime = 0;
  }
}

async function enableWeatherAudio() {
  if (weatherAudioState === 'idle') {
    await audioManager.start();
  } else {
    await audioManager.resume();
  }

  await syncWeatherAudioPlayback({
    forceRefresh: audioConfig.sourceType === 'weather' && weatherAudioState === 'idle',
  });

  weatherAudioState = 'running';
  syncSettingsUI();
  syncModeUI();
}

async function pauseWeatherAudio() {
  await audioManager.pause();
  pauseWeatherAudioElements(false);
  weatherAudioState = 'paused';
  syncWeatherAudioUI();
  syncModeUI();
}

async function toggleWeatherAudio() {
  if (weatherAudioState === 'running') {
    await pauseWeatherAudio();
    return;
  }

  await enableWeatherAudio();
}

async function toggleTrack(trackId: string) {
  const track = getTrackById(trackId);
  if (!track.src) {
    return;
  }

  const runtime = getTrackRuntimeState(trackId);
  runtime.isActive = !runtime.isActive;

  if (runtime.isActive) {
    await playTrack(trackId);
  } else {
    stopTrack(trackId);
  }

  renderMixerGrid();
  syncModeUI();
}

function updateTrackVolume(trackId: string, volumePercent: number) {
  const runtime = getTrackRuntimeState(trackId);
  const track = getTrackById(trackId);
  if (!track.src || !runtime.isActive) {
    updateTrackVolumeUI(trackId, runtime.volume * 100);
    return;
  }

  runtime.volume = Math.max(0, Math.min(1, volumePercent / 100));

  if (runtime.element) {
    runtime.element.volume = runtime.volume;
  }

  updateTrackVolumeUI(trackId, volumePercent);
}

function toggleFavorite(trackId: string) {
  const runtime = getTrackRuntimeState(trackId);
  runtime.isFavorite = !runtime.isFavorite;
  renderMixerGrid();
}

function bindWeatherAudioEvents() {
  document.getElementById('audioControlBtn')?.addEventListener('click', async () => {
    await toggleWeatherAudio();
  });
}

function bindModeControlEvents() {
  const miniModeBtn = document.getElementById('miniModeBtn');
  const ghostModeBtn = document.getElementById('ghostModeBtn');
  const miniRestoreBtn = document.getElementById('miniRestoreBtn');

  miniModeBtn?.addEventListener('click', async () => {
    if (isGhostMode) return;
    const nextMini = viewMode !== 'mini';
    viewMode = nextMini ? 'mini' : 'standard';
    syncModeUI();
    try {
      await invoke('set_mini_mode', { isMini: nextMini });
    } catch (error) {
      console.error('Failed to set mini mode:', error);
    }
  });

  ghostModeBtn?.addEventListener('click', async () => {
    if (viewMode === 'mini') return;
    isGhostMode = !isGhostMode;
    syncModeUI();
    try {
      await invoke('set_window_click_through', { ignore: isGhostMode });
    } catch (error) {
      console.error('Failed to set click-through:', error);
      isGhostMode = !isGhostMode;
      syncModeUI();
    }
  });

  miniRestoreBtn?.addEventListener('click', async () => {
    viewMode = 'standard';
    syncModeUI();
    try {
      await invoke('set_mini_mode', { isMini: false });
    } catch (error) {
      console.error('Failed to restore from mini mode:', error);
    }
  });
}

function setupCapsuleDrag() {
  const capsuleEl = document.querySelector('.fs-mini-capsule') as HTMLElement | null;
  if (!capsuleEl) return;

  const appWindow = getCurrentWindow();
  capsuleEl.addEventListener('mousedown', async (event) => {
    const target = event.target as HTMLElement;

    if (
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[class*="btn"]') ||
      target.closest('#miniRestoreBtn')
    ) {
      return;
    }

    event.preventDefault();

    if (event.buttons === 1) {
      try {
        await appWindow.startDragging();
      } catch (err) {
        console.error('Failed to drag window:', err);
      }
    }
  });
}

async function ensureStandardWindowState(appWindow: ReturnType<typeof getCurrentWindow>) {
  await Promise.all([
    appWindow.setResizable(true),
    appWindow.setMaximizable(true),
    appWindow.setMinimizable(true),
    appWindow.setClosable(true),
    appWindow.setFullscreen(false),
  ]);
}

async function syncNativeWindowState(appWindow: ReturnType<typeof getCurrentWindow>) {
  const [isFullscreen, isResizable, isMaximizable] = await Promise.all([
    appWindow.isFullscreen(),
    appWindow.isResizable(),
    appWindow.isMaximizable(),
  ]);

  document.body.classList.toggle('is-native-fullscreen', isFullscreen);
  document.body.classList.toggle('is-mini-mode', viewMode === 'mini');

  if (viewMode === 'standard' && (!isResizable || !isMaximizable)) {
    await ensureStandardWindowState(appWindow);
  }
}

function setupResizeHandles() {
  const appWindow = getCurrentWindow();
  document.querySelectorAll<HTMLElement>('.fs-window-resize-handle').forEach((handle) => {
    handle.addEventListener('mousedown', async (event) => {
      if (viewMode === 'mini' || isGhostMode || event.buttons !== 1) {
        return;
      }

      event.preventDefault();
      const direction = handle.dataset.resizeDirection as WindowResizeDirection | undefined;
      if (!direction) {
        return;
      }

      try {
        await appWindow.startResizeDragging(direction);
      } catch (error) {
        console.error('Failed to start resize dragging:', error);
      }
    });
  });
}

async function setupNativeWindowTracking() {
  const appWindow = getCurrentWindow();
  await ensureStandardWindowState(appWindow);
  await syncNativeWindowState(appWindow);

  await appWindow.onResized(async () => {
    await syncNativeWindowState(appWindow);
  });

  await appWindow.onMoved(async () => {
    await syncNativeWindowState(appWindow);
  });

  window.addEventListener('focus', () => {
    void syncNativeWindowState(appWindow);
  });
}

function setupGhostModeListener(isTauri: boolean) {
  if (!isTauri) return;
  listen('ghost-mode-exit', async () => {
    if (isGhostMode) {
      isGhostMode = false;
      syncModeUI();
      try {
        await invoke('set_window_click_through', { ignore: false });
      } catch (error) {
        console.error('Failed to exit ghost mode:', error);
      }
    }
  });
}

function syncModeUI() {
  const uiOverlay = document.getElementById('uiOverlay');
  const miniModeBtn = document.getElementById('miniModeBtn');
  const ghostModeBtn = document.getElementById('ghostModeBtn');

  uiOverlay?.classList.toggle('is-mini', viewMode === 'mini');
  uiOverlay?.classList.toggle('is-ghost', isGhostMode);
  document.body.classList.toggle('is-mini-mode', viewMode === 'mini');

  miniModeBtn?.classList.toggle('is-active', viewMode === 'mini');
  ghostModeBtn?.classList.toggle('is-active', isGhostMode);

  // Update mini capsule energy display
  const miniEnergyEl = document.getElementById('miniCapsuleEnergy');
  if (miniEnergyEl) {
    miniEnergyEl.textContent = `${(currentEnergy * 100).toFixed(1)}% FLOW`;
  }

  // Update mini capsule icon based on active tracks
  const miniIconEl = document.getElementById('miniCapsuleIcon');
  if (miniIconEl) {
    const activeTracks = mixerTracks.filter((t) => getTrackRuntimeState(t.id).isActive && t.src);
    if (activeTracks.length > 0) {
      miniIconEl.innerHTML = getIconGlyph(activeTracks[0].icon);
    } else {
      miniIconEl.innerHTML = weatherAudioState === 'running' ? '✦' : '◌';
    }
  }

  // Disable ghost button when in mini mode
  if (ghostModeBtn) {
    (ghostModeBtn as HTMLButtonElement).disabled = viewMode === 'mini';
  }
}

function bindPermissionEvents() {
  document.getElementById('requestAccessibilityBtn')?.addEventListener('click', async () => {
    try {
      await invoke<PermissionStatus>('request_accessibility_permission');
      await invoke('open_privacy_settings', { target: 'accessibility' });
    } catch (error) {
      console.error('❌ 请求辅助功能权限失败:', error);
    }

    await loadPermissionStatus(true);
  });

  document.getElementById('openInputMonitoringBtn')?.addEventListener('click', async () => {
    try {
      await invoke('open_privacy_settings', { target: 'input-monitoring' });
    } catch (error) {
      console.error('❌ 打开输入监控设置失败:', error);
    }
  });

  document.getElementById('refreshPermissionBtn')?.addEventListener('click', async () => {
    await loadPermissionStatus(true);
  });
}

function bindMixerEvents() {
  document.getElementById('categoryNav')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('[data-category-id]');
    if (!button) {
      return;
    }

    const categoryId = button.dataset.categoryId as MixerCategoryId;
    if (!categoryId || categoryId === selectedCategoryId) {
      return;
    }

    selectedCategoryId = categoryId;
    renderCategoryNav();
    renderMixerGrid();
  });

  document.getElementById('mixerGrid')?.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const favoriteButton = target.closest<HTMLButtonElement>('[data-track-favorite]');
    if (favoriteButton) {
      toggleFavorite(favoriteButton.dataset.trackFavorite as string);
      event.stopPropagation();
      return;
    }

    if (target.closest('[data-track-volume]')) {
      return;
    }

    const card = target.closest<HTMLElement>('[data-track-id]');
    if (!card) {
      return;
    }

    await toggleTrack(card.dataset.trackId as string);
  });

  document.getElementById('mixerGrid')?.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (!target.matches('[data-track-volume]')) {
      return;
    }

    updateTrackVolume(target.dataset.trackVolume as string, Number(target.value));
  });
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

  settingsSaveBtn?.addEventListener('click', async () => {
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
    if (weatherAudioState === 'running') {
      try {
        await syncWeatherAudioPlayback({
          forceRefresh: audioConfig.sourceType === 'weather',
        });
      } catch (error) {
        console.error('❌ Weather audio refresh failed:', error);
      }
    }
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

    // Tauri 窗口在启动瞬间可能尚未获得焦点，但欢迎页需要立即渲染。
    const shouldRender = !document.hidden;
    visualManager.setRenderingActive(shouldRender);
  };

  document.addEventListener('visibilitychange', syncRenderingState);
  window.addEventListener('blur', syncRenderingState);
  window.addEventListener('focus', syncRenderingState);
  syncRenderingState();
}

async function loadPermissionStatus(isTauri: boolean) {
  if (!isTauri) {
    permissionStatus = null;
    syncPermissionUI();
    return;
  }

  try {
    permissionStatus = await invoke<PermissionStatus>('get_permission_status');
  } catch (error) {
    permissionStatus = null;
    console.error('❌ 权限状态获取失败:', error);
  }

  syncPermissionUI();
}

async function loadStartupWeather() {
  try {
    const weather = await audioManager.loadWeatherContext({ forceRefresh: true });
    startupWeather = weather;
    syncSettingsUI();
  } catch (error) {
    startupWeather = null;
    console.error('❌ Startup weather fetch failed, fallback to weather defaults:', error);
    audioManager.setWeatherAmbience('wind');
    syncSettingsUI();
  }
}

function updateEnergy(energy: number) {
  currentEnergy = energy;
  const energyElement = document.getElementById('energyValue');
  const uiOverlay = document.getElementById('uiOverlay');

  if (energyElement) {
    energyElement.textContent = `${(energy * 100).toFixed(1)}%`;
  }

  if (uiOverlay) {
    const glowAlpha = 0.16 + energy * 0.58;
    const hue = 205 + energy * 18;
    const glowColor = `hsla(${hue}, 100%, 72%, ${0.22 + energy * 0.5})`;
    uiOverlay.style.setProperty('--energy-intensity', energy.toFixed(3));
    uiOverlay.style.setProperty('--energy-glow-alpha', glowAlpha.toFixed(3));
    uiOverlay.style.setProperty('--energy-glow-color', glowColor);
  }

  // Update mini capsule energy display
  const miniEnergyEl = document.getElementById('miniCapsuleEnergy');
  if (miniEnergyEl) {
    miniEnergyEl.textContent = `${(energy * 100).toFixed(1)}% FLOW`;
  }

  syncWeatherAudioVolumes();
  audioManager.updateEnergy(energy);
  visualManager?.updateEnergy(energy);
}

async function main() {
  createUI();
  setupRenderLifecycle();

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  await loadPermissionStatus(Boolean(isTauri));
  await loadStartupWeather();
  updateEnergy(currentEnergy);

  if (isTauri) {
    setupGhostModeListener(true);
    setupCapsuleDrag();
    setupResizeHandles();
    await setupNativeWindowTracking();
    try {
      await listen<number>('flow-energy-update', (event) => {
        updateEnergy(event.payload);
      });
    } catch (error) {
      console.error('❌ Tauri 事件监听失败:', error);
    }
  } else {
    console.warn('⚠️ 检测到浏览器环境，此项目需要 Tauri 桌面环境运行。');
  }
}

main();
