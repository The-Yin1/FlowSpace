import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AudioManager,
  type AudioConfig,
  type AudioSourceType,
  type WeatherAmbience,
} from './audio/AudioManager';
import { VisualManager } from './visual/VisualManager';

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

type MasterAudioState = 'idle' | 'running' | 'paused';

const audioManager = new AudioManager();
let visualManager: VisualManager | null = null;
let startupWeather: StartupWeather | null = null;
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
let masterAudioState: MasterAudioState = 'idle';

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
      { id: 'light_rain', name: '小雨', icon: 'rain-1', src: '' },
      { id: 'heavy_rain', name: '大雨', icon: 'rain-2', src: '' },
      { id: 'window_rain', name: '窗户雨声', icon: 'window', src: '' },
      { id: 'umbrella_rain', name: '雨伞雨声', icon: 'umbrella', src: '' },
      { id: 'car_rain', name: '车顶雨声', icon: 'car', src: '' },
      { id: 'leaf_rain', name: '树叶雨声', icon: 'leaf-rain', src: '' },
      { id: 'tent_rain', name: '帐篷雨声', icon: 'tent', src: '' },
      { id: 'thunder', name: '雷声', icon: 'thunder', src: '' },
    ],
  },
  {
    id: 'animals',
    name: '动物',
    icon: 'animal-icon',
    tracks: [
      { id: 'birds', name: '鸟鸣', icon: 'bird', src: '' },
      { id: 'beehive', name: '蜂巢', icon: 'bee', src: '' },
      { id: 'cat_purr', name: '猫咪呼噜', icon: 'cat', src: '' },
      { id: 'rooster', name: '鸡鸣', icon: 'rooster', src: '' },
      { id: 'cow', name: '牛叫', icon: 'cow', src: '' },
      { id: 'cricket', name: '蟋蟀', icon: 'cricket', src: '' },
      { id: 'crow', name: '乌鸦', icon: 'crow', src: '' },
      { id: 'dog', name: '狗叫', icon: 'dog', src: '' },
      { id: 'frog', name: '青蛙', icon: 'frog', src: '' },
      { id: 'horse_gallop', name: '马蹄声', icon: 'horse', src: '' },
      { id: 'owl', name: '猫头鹰', icon: 'owl', src: '' },
      { id: 'seagull', name: '海鸥', icon: 'seagull', src: '' },
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

      .fs-workspace {
        position: fixed;
        inset: 92px 24px 28px;
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

        .fs-workspace {
          inset: 164px 16px 16px;
        }
      }

      @media (max-width: 640px) {
        .fs-workspace {
          inset: 176px 12px 12px;
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
          <button id="settingsToggleBtn" class="fs-settings-button" type="button" aria-label="打开设置">⚙</button>
        </div>
      </header>

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

  bindTopBarEvents();
  bindMixerEvents();
  bindSettingsPanelEvents();
  renderCategoryNav();
  renderMixerGrid();
  syncSettingsUI();
  syncHud();
}

function getIconGlyph(icon: string): string {
  const iconMap: Record<string, string> = {
    'tree-icon': '◌',
    'rain-icon': '◍',
    'animal-icon': '◎',
    wave: '≈',
    ocean: '∿',
    fire: '✦',
    wind: '⟡',
    'wind-bold': '✧',
    leaf: '❋',
    waterfall: '⋰',
    snow: '❄',
    'leaf-fall': '❊',
    stone: '⬡',
    drop: '◔',
    forest: '✺',
    'rain-1': '﹒',
    'rain-2': '∶',
    window: '▣',
    umbrella: '◠',
    car: '▭',
    'leaf-rain': '❉',
    tent: '△',
    thunder: 'ϟ',
    bird: '◜',
    bee: '⟢',
    cat: '◡',
    rooster: '◬',
    cow: '◫',
    cricket: '⌁',
    crow: '◣',
    dog: '◤',
    frog: '◭',
    horse: '◨',
    owl: '◩',
    seagull: '⌒',
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

function resolveAudioStatusText(): string {
  const runningLabel = masterAudioState === 'running' ? '已启动' : masterAudioState === 'paused' ? '已暂停' : '待启动';
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

function syncHud() {
  const audioModeStatus = document.getElementById('audioModeStatus');
  const audioControlBtn = document.getElementById('audioControlBtn');
  const selectedCategoryLabel = document.getElementById('selectedCategoryLabel');
  const activeTrackCount = document.getElementById('activeTrackCount');
  const favoriteTrackCount = document.getElementById('favoriteTrackCount');

  if (audioModeStatus) {
    audioModeStatus.textContent = resolveAudioStatusText();
  }

  if (audioControlBtn) {
    audioControlBtn.textContent = masterAudioState === 'running' ? '暂停音频' : masterAudioState === 'paused' ? '恢复音频' : '启动音频';
  }

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
      const resolvedLabel = startupWeather.ambience === 'rain' ? '雨声' : '风声';
      weatherPanelHint.textContent = `当前定位：${startupWeather.city}, ${startupWeather.country} · ${resolvedLabel} · 可留空以继续自动匹配。`;
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
  syncHud();
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
    return masterAudioState === 'running' ? 'Now Playing' : 'Armed';
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

  syncHud();
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

async function resumeActiveTracks() {
  const activeTracks = mixerTracks.filter((track) => getTrackRuntimeState(track.id).isActive && track.src);
  for (const track of activeTracks) {
    await playTrack(track.id);
  }
}

function pauseActiveTracks() {
  mixerTracks.forEach((track) => {
    const runtime = getTrackRuntimeState(track.id);
    if (runtime.isActive && runtime.element) {
      runtime.element.pause();
    }
  });
}

async function enableMasterAudio() {
  audioManager.setAudioConfig(audioConfig);
  if (masterAudioState === 'idle') {
    await audioManager.start();
  } else {
    await audioManager.resume();
  }

  masterAudioState = 'running';
  await resumeActiveTracks();
  syncHud();
  renderMixerGrid();
}

async function pauseMasterAudio() {
  await audioManager.pause();
  pauseActiveTracks();
  masterAudioState = 'paused';
  syncHud();
  renderMixerGrid();
}

async function toggleMasterAudio() {
  if (masterAudioState === 'running') {
    await pauseMasterAudio();
    return;
  }

  await enableMasterAudio();
}

async function toggleTrack(trackId: string) {
  const track = getTrackById(trackId);
  if (!track.src) {
    return;
  }

  const runtime = getTrackRuntimeState(trackId);
  runtime.isActive = !runtime.isActive;

  if (runtime.isActive) {
    if (masterAudioState !== 'running') {
      await enableMasterAudio();
    }
    await playTrack(trackId);
  } else {
    stopTrack(trackId);
  }

  renderMixerGrid();
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

function bindTopBarEvents() {
  document.getElementById('audioControlBtn')?.addEventListener('click', async () => {
    await toggleMasterAudio();
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
      () => resolve(null),
      {
        enableHighAccuracy: false,
        timeout: 3000,
        maximumAge: 30 * 60 * 1000,
      },
    );
  });
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

  audioManager.updateEnergy(energy);
  visualManager?.updateEnergy(energy);
}

async function main() {
  createUI();
  setupRenderLifecycle();

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  await loadStartupWeather(Boolean(isTauri));
  updateEnergy(currentEnergy);

  if (isTauri) {
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
