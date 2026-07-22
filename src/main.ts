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
    'tree-icon': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 48c-34 0-59 22-65 52-28 5-51 22-60 47-43 3-75 37-75 81 0 44 32 79 75 83 3 1 7 1 10 1h230c3 0 7 0 10-1 43-4 75-39 75-83 0-44-32-78-75-81-9-25-32-42-60-47-6-30-31-52-65-52zm0 32c21 0 38 14 42 34l2 10 10 2c17 3 32 12 41 26l7 11 13 2c25 3 43 24 43 50 0 27-20 49-46 51l-11 1H155l-11-1c-26-2-46-24-46-51 0-26 18-47 43-50l13-2 7-11c9-14 24-23 41-26l10-2 2-10c4-20 21-34 42-34zm-40 224c-18 0-32 14-32 32v128c0 18 14 32 32 32s32-14 32-32V336c0-18-14-32-32-32zm48 0c-9 0-17 7-17 16v160c0 9 8 16 16 16s16-7 16-16V320c0-9-7-16-15-16zm48 0c-18 0-32 14-32 32v96c0 18 14 32 32 32s32-14 32-32v-96c0-18-14-32-32-32z"/></svg>',
    'rain-icon': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M399 160c-7-52-47-94-99-106-8-42-35-77-72-93-49-21-107-8-141 33-9-2-18-2-27-2-66 0-120 54-120 120 0 66 54 120 120 120h304c53 0 96-43 96-96 0-49-36-89-83-95 0-1 0-1 1 0 8 7 14 12 21 19zm-143 72c0 53-43 96-96 96s-96-43-96-96c0-53 43-96 96-96s96 43 96 96zm-32 0c0-35-29-64-64-64s-64 29-64 64c0 35 29 64 64 64s64-29 64-64z"/></svg>',
    'animal-icon': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 224c-79 0-144 64-144 144 0 79 64 144 144 144 79 0 144-64 144-144 0-80-65-144-144-144zm0 32c62 0 112 50 112 112 0 62-50 112-112 112-62 0-112-50-112-112 0-62 50-112 112-112zm0 32c-44 0-80 36-80 80s36 80 80 80 80-36 80-80-36-80-80-80zm-46 194c6 2 12 4 18 4 12 0 24-4 34-10l43 43c3 3 6 4 10 4 3 0 7-1 10-4 6-6 6-15 0-21l-43-43c6-10 10-22 10-34 0-6-2-12-4-18-6-16-21-26-40-26-18 0-33 10-39 26-2 7-3 12-3 18 0 12 4 24 11 34l-43 43c-5 6-5 15 0 21 3 3 7 4 10 4 4 0 8-1 10-4z"/></svg>',
    wave: '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M5.996 9c1.413 0 2.16-.747 2.705-1.293.49-.49.731-.707 1.292-.707s.802.217 1.292.707C11.83 8.253 12.577 9 13.991 9c1.415 0 2.163-.747 2.71-1.293.491-.49.732-.707 1.295-.707s.804.217 1.295.707C19.837 8.253 20.585 9 22 9V7c-.563 0-.804-.217-1.295-.707C20.159 5.747 19.411 5 17.996 5s-2.162.747-2.709 1.292c-.491.491-.731.708-1.296.708-.562 0-.802-.217-1.292-.707C12.154 5.747 11.407 5 9.993 5s-2.161.747-2.706 1.293c-.49.49-.73.707-1.291.707s-.801-.217-1.291-.707C4.16 5.747 3.413 5 2 5v2c.561 0 .801.217 1.291.707C3.836 8.253 4.583 9 5.996 9zm0 5c1.413 0 2.16-.747 2.705-1.293.49-.49.731-.707 1.292-.707s.802.217 1.292.707c.545.546 1.292 1.293 2.706 1.293 1.415 0 2.163-.747 2.71-1.293.491-.49.732-.707 1.295-.707s.804.217 1.295.707C19.837 13.253 20.585 14 22 14v-2c-.563 0-.804-.217-1.295-.707-.546-.546-1.294-1.293-2.709-1.293s-2.162.747-2.709 1.292c-.491.491-.731.708-1.296.708-.562 0-.802-.217-1.292-.707C12.154 10.747 11.407 10 9.993 10s-2.161.747-2.706 1.293c-.49.49-.73.707-1.291.707s-.801-.217-1.291-.707C4.16 10.747 3.413 10 2 10v2c.561 0 .801.217 1.291.707C3.836 13.253 4.583 14 5.996 14zm0 5c1.413 0 2.16-.747 2.705-1.293.49-.49.731-.707 1.292-.707s.802.217 1.292.707c.545.546 1.292 1.293 2.706 1.293 1.415 0 2.163-.747 2.71-1.293.491-.49.732-.707 1.295-.707s.804.217 1.295.707C19.837 18.253 20.585 19 22 19v-2c-.563 0-.804-.217-1.295-.707-.546-.546-1.294-1.293-2.709-1.293s-2.162.747-2.709 1.292c-.491.491-.731.708-1.296.708-.562 0-.802-.217-1.292-.707C12.154 15.747 11.407 15 9.993 15s-2.161.747-2.706 1.293c-.49.49-.73.707-1.291.707s-.801-.217-1.291-.707C4.16 15.747 3.413 15 2 15v2c.561 0 .801.217 1.291.707C3.836 18.253 4.583 19 5.996 19z" stroke="#94A3B8" fill="#94A3B8" stroke-width="0px"></path></svg>',
    ocean: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M64 320c0 54 30 96 96 96 40 0 64-28 96-28s56 28 96 28c66 0 96-42 96-96 0-88-48-128-96-128-40 0-64 32-96 32s-56-32-96-32c-66 0-96 40-96 128zm-16 80c-18 0-32 14-32 32s14 32 32 32c40 0 90 24 128 24s88-24 128-24 58 24 96 24c10 0 19-1 28-3l62 36c14 8 32 3 40-11 8-14 3-32-11-40l-68-40c12-8 22-17 30-28 15-19 12-46-7-61s-46-12-61 7c-8 10-20 16-34 16-38 0-64-24-96-24s-56 24-96 24-90-24-128-24c-8 0-16 1-23 3z"/></svg>',
    fire: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 48C144 48 64 160 64 256c0 64 48 144 112 144 32 0 48-48 80-48s48 48 80 48c64 0 112-80 112-144 0-96-80-208-192-208zm0 49c87 0 128 107 128 159 0 48-32 80-64 80-16 0-48-32-64-32-16 0-48 32-64 32-32 0-64-32-64-80 0-52 41-159 128-159z"/></svg>',
    wind: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M128 256c0 18 14 32 32 32h256c18 0 32-14 32-32s-14-32-32-32H160c-18 0-32 14-32 32zm-32 96c0 18 14 32 32 32h192c18 0 32-14 32-32s-14-32-32-32H128c-18 0-32 14-32 32zm64-192c0 18 14 32 32 32h256c18 0 32-14 32-32s-14-32-32-32H192c-18 0-32 14-32 32z"/></svg>',
    'wind-bold': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M96 208c-18 0-32 14-32 32s14 32 32 32h320c18 0 32-14 32-32s-14-32-32-32H96zm0 96c-18 0-32 14-32 32s14 32 32 32h256c18 0 32-14 32-32s-14-32-32-32H96zm32-192c-18 0-32 14-32 32s14 32 32 32h320c18 0 32-14 32-32s-14-32-32-32H128z"/></svg>',
    leaf: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 64C128 64 64 192 64 256c0 64 32 112 32 112 32-64 96-96 160-96s128 32 160 96c0 0 32-48 32-112 0-64-64-192-192-192zm0 64c-14 0-26 6-35 15-26-48-49-48-66-20-19 31 6 55 44 63 16-20 23-58 57-58zm17 30c25 4 49 15 68 33 13-26 38-28 52-8 16 25-1 42-12 47 0-3 0-7-1-10-1-12-10-21-22-21s-21 9-22 21c0 4-1 7 0 11-36-18-63-73-63-73z"/></svg>',
    waterfall: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M160 48c0 18 14 32 32 32h128c18 0 32-14 32-32s-14-32-32-32H192c-18 0-32 14-32 32zm-32 96c-18 0-32 14-32 32v256c0 53 28 96 64 96s64-43 64-96V208h64v128c0 53 28 96 64 96s64-43 64-96V176c0-18-14-32-32-32H128z"/></svg>',
    snow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 80c-18 0-32 14-32 32v36l-33-17c-16-8-35-2-43 14s-2 35 14 43l30 16-30 16c-16 8-22 27-14 43 5 11 16 17 28 17 5 0 10-1 15-5l33-17v36c0 18 14 32 32 32s32-14 32-32v-36l33 17c5 3 10 5 15 5 12 0 23-6 28-17 8-16 2-35-14-43l-30-16 30-16c16-8 22-27 14-43s-27-22-43-14l-33 17v-36c0-18-14-32-32-32zm0 176c-26 0-48 22-48 48s22 48 48 48 48-22 48-48-22-48-48-48z"/></svg>',
    'leaf-fall': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M304 64c-8 0-16 3-22 8-11-7-25-10-39-8-32 6-52 34-44 64 8 30 37 48 68 40 14-4 26-13 33-25 10 36 44 60 83 56 44-5 76-42 71-86-4-32-25-57-55-64-16-3-31 1-43 10-11-22-29-37-52-39-7 0-12 2-17 5-4-5-11-8-18-8zm59 65c8 7 12 17 12 28 0 23-19 42-42 42s-42-19-42-42c0-11 4-21 12-28 6 22 34 35 60 0zM192 288c-12 0-24 4-33 12-16-10-36-14-56-12-48 6-82 50-76 98s50 82 98 76c38-5 67-33 72-70l67 38c14 8 32 3 40-11s3-32-11-40l-68-40c10-12 16-26 18-41 0-6 3-13 4-19 2-17-11-33-28-35s-33 11-35 28l-1 8c-4 14-7 28-13 41l-38-22c5-16 6-31 3-47-4-21-23-37-53-37v-8z"/></svg>',
    stone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 96C172 96 112 158 112 240c0 44 16 88 40 124l-8 42c-3 14 6 27 20 30s27-6 30-20l5-28c26 16 56 28 89 28 32 0 62-12 88-28l4 18c3 14 16 23 30 20s23-16 20-30l-4-32c16-30 26-74 26-124 0-82-56-144-136-144z"/></svg>',
    drop: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 96C192 166 128 228 128 288c0 70 57 128 128 128s128-58 128-128c0-60-64-122-128-192zm0 48c42 54 96 108 96 144 0 53-43 96-96 96s-96-43-96-96c0-36 54-90 96-144z"/></svg>',
    forest: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M128 368V176c0-18-14-32-32-32S64 158 64 176v192h-8c-4 0-9 1-13 4-5 3-8 9-8 15 0 5 2 11 7 14l203 97c5 3 11 4 17 4l-2 10c0 18 14 32 32 32s32-14 32-32l2-10c6 0 12-1 17-4l203-97c5-3 7-9 7-14 0-6-3-12-8-15-4-3-9-4-13-4h-8V176c0-18-14-32-32-32s-32 14-32 32v192h-64V176c0-18-14-32-32-32s-32 14-32 32v192h-64V176c0-18-14-32-32-32s-32 14-32 32v192h-64z"/></svg>',
    'rain-1': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M128 296c6 0 12-2 17-5l11-7c5-3 8-9 8-15s-3-12-8-15l-11-7c-5-3-11-5-17-5s-12 2-17 5l-11 7c-5 3-8 9-8 15s3 12 8 15l11 7c5 3 11 5 17 5zm128 0c6 0 12-2 17-5l11-7c5-3 8-9 8-15s-3-12-8-15l-11-7c-5-3-11-5-17-5s-12 2-17 5l-11 7c-5 3-8 9-8 15s3 12 8 15l11 7c5 3 11 5 17 5zm-64 64c6 0 12-2 17-5l11-7c5-3 8-9 8-15s-3-12-8-15l-11-7c-5-3-11-5-17-5s-12 2-17 5l-11 7c-5 3-8 9-8 15s3 12 8 15l11 7c5 3 11 5 17 5zm128-64c6 0 12-2 17-5l11-7c5-3 8-9 8-15s-3-12-8-15l-11-7c-5-3-11-5-17-5s-12 2-17 5l-11 7c-5 3-8 9-8 15s3 12 8 15l11 7c5 3 11 5 17 5z"/></svg>',
    'rain-2': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M96 272c0 8 3 16 8 21l33 33-33 33c-5 5-8 13-8 21 0 8 3 16 8 21 6 6 13 9 21 9s15-3 21-9l33-33 33 33c6 6 13 9 21 9s15-3 21-9c6-5 9-13 9-21s-3-16-9-21l-33-33 33-33c6-5 9-13 9-21s-3-16-9-21c-11-11-30-11-41 0l-33 33-33-33c-11-11-30-11-41 0-6 5-9 13-9 21zm128 0l33 33-33 33-33-33 33-33zm-128 128l33 33-33 33-33-33 33-33zm256 0l33 33-33 33-33-33 33-33z"/></svg>',
    window: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M80 96c-26 0-48 22-48 48v224c0 26 22 48 48 48h352c26 0 48-22 48-48V144c0-26-22-48-48-48H80zm0 32h352c9 0 16 7 16 16v32H64v-32c0-9 7-16 16-16zm-16 80h384v160c0 9-7 16-16 16H80c-9 0-16-7-16-16V208zm48 16c-9 0-16 7-16 16s7 16 16 16h64c9 0 16-7 16-16s-7-16-16-16h-64z"/></svg>',
    umbrella: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 64C160 64 80 128 80 208c0 18 14 32 32 32h112v96c0 44 14 80 32 80s32-36 32-80v-96h112c18 0 32-14 32-32 0-80-80-144-176-144zm0 48c78 0 132 44 140 96H116c8-52 62-96 140-96z"/></svg>',
    car: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M128 144c-26 0-48 22-48 48v80h352v-80c0-26-22-48-48-48H128zm-64 160v80c0 26 22 48 48 48h16c26 0 48-22 48-48v-16h160v16c0 26 22 48 48 48h16c26 0 48-22 48-48v-80H64zm32 32h48v16H96v-16zm272 0h48v16h-48v-16z"/></svg>',
    'leaf-rain': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M304 96c-48 0-96 48-96 128 0 22 3 42 8 58l-136 76c-14 8-19 26-11 40s26 19 40 11l128-72c22 18 46 31 68 37 4 45 39 81 85 85 53 5 101-35 105-88 4-46-25-87-68-103-10-51-33-83-55-99-6 22-16 44-28 63l-4-8c0-4 0-9-1-13 5-5 9-11 12-18-16 16-37 28-59 34l-8-12c-1 5-1 9-1 14 0 29 14 55 35 71-8 41-34 67-63 67-26 0-50-26-67-65 18-20 29-46 29-74 0-80 48-128 96-128z"/></svg>',
    tent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 96L96 384h320L256 96zm0 73l109 183H147l109-183zm-48 215c-9 0-16 7-16 16s7 16 16 16h96c9 0 16-7 16-16s-7-16-16-16h-96z"/></svg>',
    thunder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M272 64l-144 208h96l-48 176 192-240h-96l64-144h-64zm-16 48h24l-56 128h96l-140 176 36-128H112l144-176z"/></svg>',
    bird: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M352 128c-88 0-160 72-160 160 0 16 2 32 7 47l-103 59c-10 6-14 19-8 29 4 7 12 12 20 12 3 0 6-1 9-2l61-24 48 48c3-15 5-31 6-47 38-33 80-70 120-90 23-42 69-63 116-48 38 12 66 48 66 90 0 44-36 80-80 80-27 0-51-14-65-35-27 3-56 12-83 26l-8 6c20 22 49 35 83 35 61 0 112-49 112-110 0-57-43-103-101-109-13-50-58-84-112-84z"/></svg>',
    bee: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 80c-53 0-96 44-96 98 0 18 4 35 12 50l-48 28c-14 8-19 26-11 40 5 10 16 16 27 16 4 0 9-1 13-4l47-27c16 16 36 28 56 35 2 51 42 92 94 92s92-41 94-92c20-7 40-19 56-35l47 27c4 3 9 4 13 4 11 0 22-6 27-16 8-14 3-32-11-40l-48-28c8-15 12-32 12-50 0-54-43-98-96-98zm0 48c28 0 48 20 48 50s-20 50-48 50-48-20-48-50 20-50 48-50z"/></svg>',
    cat: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 128c-70 0-128 58-128 128 0 70 58 128 128 128s128-58 128-128c0-70-58-128-128-128zm0 48c18 0 32 7 42 18l22-14c8-5 18-3 23 5s3 18-5 23l-22 14c2 6 4 12 4 18s-2 12-4 18l22 14c8 5 10 15 5 23s-15 10-23 5l-22-14c-10 11-24 18-42 18s-32-7-42-18l-22 14c-8 5-18 3-23-5s-3-18 5-23l22-14c-2-6-4-12-4-18s2-12 4-18l-22-14c-8-5-10-15-5-23s15-10 23-5l22 14c10-11 24-18 42-18z"/></svg>',
    rooster: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M320 96c-44 0-80 20-96 48h-32c-18 0-32 14-32 32s14 32 32 32h32c-5 16-8 32-8 48 0 32 8 64 24 88l-112 64c-10 6-14 19-8 29 6 10 19 14 29 8l112-64c24 18 56 26 89 23 9 32 30 56 60 56 32 0 55-26 57-58 20-4 37-16 49-33l74 26c5 2 10 3 15 3 15 0 28-9 31-24 4-17-7-33-24-37l-68-24c5-22 3-44-6-64 40-22 69-64 72-113 1-17-12-32-29-33s-32 12-33 29c-1 24-10 46-25 62 0-79-66-144-144-144zm0 48c53 0 96 43 96 96s-43 96-96 96-96-43-96-96 43-96 96-96z"/></svg>',
    cow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 128c-62 0-112 48-112 112 0 18 4 34 12 48l-48 32c-10 6-13 19-7 29s19 13 29 7l45-30c22 29 52 50 86 50 56 0 104-42 114-96 48 0 88-40 88-88 0-18-14-32-32-32s-32 14-32 32c0 14-10 24-24 24-14 0-24-10-24-24 0-18-14-32-32-32s-32 14-32 32c0 14-10 24-24 24s-24-10-24-24c0-18-14-32-32-32s-32 14-32 32c0 14-10 24-24 24-14 0-24-10-24-24 0-18-14-32-32-32zm44 144c12-8 26-14 42-14s30 6 42 14c-8 8-17 18-17 30 0 18 14 32 32 32s32-14 32-32c0-12-9-22-17-30 12-8 25-14 40-14 32 0 58 22 68 54h-160c10-32 36-54 68-54z"/></svg>',
    cricket: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 96c-88 0-160 72-160 160 0 88 72 160 160 160s160-72 160-160c0-88-72-160-160-160zm0 48c26 0 48 22 48 48s-22 48-48 48-48-22-48-48 22-48 48-48zm0 112c44 0 80 36 80 80 0 18-14 32-32 32s-32-14-32-32c0-9-7-16-16-16s-16 7-16 16c0 18-14 32-32 32s-32-14-32-32c0-9-7-16-16-16s-16 7-16 16c0 18-14 32-32 32s-32-14-32-32c0-44 36-80 80-80h96z"/></svg>',
    crow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M160 160c-18 0-32 14-32 32s14 32 32 32 32-14 32-32-14-32-32-32zm192 0c-18 0-32 14-32 32s14 32 32 32 32-14 32-32-14-32-32-32zM256 224c-88 0-160 56-160 128v32c0 18 14 32 32 32h80c18 0 32-14 32-32v-16l48 48c12 12 32 12 44 0l48-48v16c0 18 14 32 32 32h80c18 0 32-14 32-32v-32c0-72-72-128-160-128zm0 32c70 0 132 42 146 96H110c14-54 76-96 146-96z"/></svg>',
    dog: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 112c-62 0-112 50-112 112v128c0 18 14 32 32 32s32-14 32-32V256h96v96c0 18 14 32 32 32s32-14 32-32V224c0-62-50-112-112-112zm-64 96h-32c-18 0-32 14-32 32s14 32 32 32h32c18 0 32-14 32-32s-14-32-32-32zm128 0h-32c-18 0-32 14-32 32s14 32 32 32h32c18 0 32-14 32-32s-14-32-32-32z"/></svg>',
    frog: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 128c-62 0-112 50-112 112v64c0 52 42 96 96 96h32c52 0 96-44 96-96v-64c0-62-50-112-112-112zm-64 112c0-9 7-16 16-16s16 7 16 16-7 16-16 16-16-7-16-16zm128 0c0-9 7-16 16-16s16 7 16 16-7 16-16 16-16-7-16-16z"/></svg>',
    horse: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M340 96c-28 2-54 10-76 22l-94-56c-10-6-22-6-32 0-10 5-16 16-16 26v64H80c-10 0-19 5-24 14-6 9-5 20 2 28l128 128c-2 6-4 14-2 22l-80 48c-10 6-14 19-8 29s19 14 29 8l69-42c16 16 36 28 59 33 2 24 22 42 46 42 24 0 44-18 46-42 36-9 66-36 80-69 40-2 76-26 86-64 10-38-11-77-47-92l-52-30c4-16 2-32-6-48 16-14 26-34 26-56 0-46-38-84-85-84zm0 48c18 0 32 14 32 32s-14 32-32 32-32-14-32-32 14-32 32-32z"/></svg>',
    owl: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M256 96c-88 0-160 72-160 160 0 88 72 160 160 160s160-72 160-160c0-88-72-160-160-160zm0 48c44 0 80 36 80 80 0 44-36 80-80 80s-80-36-80-80c0-44 36-80 80-80zm0 48c-18 0-32 14-32 32s14 32 32 32 32-14 32-32-14-32-32-32z"/></svg>',
    seagull: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" stroke="currentColor" fill="currentColor" stroke-width="0"><path d="M128 192c-18 0-32 14-32 32s14 32 32 32 32-14 32-32-14-32-32-32zm256 0c-18 0-32 14-32 32s14 32 32 32 32-14 32-32-14-32-32-32zM256 256c-106 0-192 58-192 128v32c0 18 14 32 32 32s32-14 32-32v-24c40-22 96-40 160-32 46-6 86 4 120 18v14c0 18 14 32 32 32s32-14 32-32v-8c0-70-86-128-192-128z"/></svg>',
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
