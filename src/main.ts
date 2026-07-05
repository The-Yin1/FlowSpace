import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AudioManager,
  type AudioConfig,
  type AudioSourceType,
  type WeatherAmbience,
} from './audio/AudioManager';

const audioManager = new AudioManager();

let startupWeather: StartupWeather | null = null;
let targetEnergy = 0;
let currentEnergy = 0;
let previousEnergy = 0;
let pomodoroSeconds = 25 * 60;
let isPomodoroRunning = false;
let pomodoroTimer: number | null = null;
let meritCount = 0;
let lastAutoMokugyoAt = 0;
let mokugyoAudioContext: AudioContext | null = null;
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
const activeMixerTracks = new Map<string, HTMLAudioElement>();

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

type MixerTrack = {
  id: string;
  title: string;
  description: string;
  icon: string;
  tags: string[];
  frequency: number;
  modulation: number;
  noise: number;
};

const featuredTracks: MixerTrack[] = [
  {
    id: 'soft-rain',
    title: '温柔雨声',
    description: '一场温柔的雨，带来内心的宁静',
    icon: '☁',
    tags: ['雨声'],
    frequency: 420,
    modulation: 0.18,
    noise: 0.55,
  },
  {
    id: 'cafe',
    title: '温馨咖啡厅',
    description: '真实的咖啡厅环境音',
    icon: '☕',
    tags: ['咖啡厅'],
    frequency: 620,
    modulation: 0.08,
    noise: 0.42,
  },
  {
    id: 'rain-cafe',
    title: '雨天咖啡厅',
    description: '窗边雨滴和远处的杯盘声',
    icon: '◌',
    tags: ['雨滴', '咖啡厅'],
    frequency: 520,
    modulation: 0.24,
    noise: 0.62,
  },
  {
    id: 'calm-rain',
    title: '悠闲雨声',
    description: '放松的雨声，适合冥想和专注',
    icon: '∿',
    tags: ['悠闲雨声'],
    frequency: 360,
    modulation: 0.14,
    noise: 0.52,
  },
  {
    id: 'window-rain',
    title: '窗边雨滴',
    description: '雨滴敲打窗户的声音',
    icon: '⌂',
    tags: ['雨滴'],
    frequency: 680,
    modulation: 0.3,
    noise: 0.48,
  },
  {
    id: 'forest-storm',
    title: '森林雷雨',
    description: '森林中的雷雨天气',
    icon: '⚡',
    tags: ['森林', '雷声'],
    frequency: 240,
    modulation: 0.38,
    noise: 0.72,
  },
  {
    id: 'ocean',
    title: '海浪',
    description: '海浪拍打海岸的自然节奏',
    icon: '≋',
    tags: ['海浪'],
    frequency: 300,
    modulation: 0.46,
    noise: 0.5,
  },
  {
    id: 'campfire',
    title: '篝火夜晚',
    description: '篝火旁的宁静夜晚',
    icon: '♨',
    tags: ['篝火', '夜晚'],
    frequency: 760,
    modulation: 0.33,
    noise: 0.35,
  },
];

const mixerTracks: MixerTrack[] = [
  ...featuredTracks,
  {
    id: 'birds',
    title: '晨间鸟鸣',
    description: '清晨的鸟儿歌声和森林声',
    icon: '♬',
    tags: ['鸟鸣', '森林'],
    frequency: 940,
    modulation: 0.28,
    noise: 0.26,
  },
  {
    id: 'wind',
    title: '风声',
    description: '轻柔的风声，带来平静',
    icon: '≋',
    tags: ['风声'],
    frequency: 280,
    modulation: 0.2,
    noise: 0.45,
  },
  {
    id: 'deep-rain',
    title: '多重雨声',
    description: '雨滴落在不同表面的丰富音效',
    icon: '☁',
    tags: ['多重雨声'],
    frequency: 500,
    modulation: 0.36,
    noise: 0.68,
  },
  {
    id: 'night-room',
    title: '夜间房间',
    description: '安静房间里的细微空气声',
    icon: '◐',
    tags: ['夜晚'],
    frequency: 180,
    modulation: 0.06,
    noise: 0.22,
  },
];

function createUI() {
  const app = document.getElementById('app') as HTMLDivElement;
  app.innerHTML = `
    <style>
      :root {
        --energy-intensity: 0;
        --zen-text: #20304a;
        --zen-muted: #6f7e92;
        --zen-soft: rgba(255, 255, 255, 0.75);
        --zen-border: rgba(255, 255, 255, 0.5);
        --zen-shadow: 0 8px 32px 0 rgba(142, 153, 165, 0.06);
        --zen-green: #13c98b;
        --zen-green-dark: #0aa573;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 360px;
        min-height: 100vh;
        font-family: Inter, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
        color: var(--zen-text);
        background:
          radial-gradient(circle at 10% 10%, rgba(207, 247, 232, 0.78), transparent 32%),
          radial-gradient(circle at 85% 5%, rgba(226, 246, 255, 0.72), transparent 26%),
          linear-gradient(135deg, #f4f7f6 0%, #ffffff 52%, #eefaf5 100%);
        overflow-x: hidden;
      }

      button,
      input,
      select {
        font: inherit;
      }

      button {
        color: inherit;
      }

      .zen-page {
        min-height: 100vh;
        padding: 22px clamp(18px, 4vw, 56px) 56px;
      }

      .zen-shell {
        width: min(1440px, 100%);
        margin: 0 auto;
      }

      .zen-header {
        position: sticky;
        top: 0;
        z-index: 16;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 16px 0 28px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      .zen-brand {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .zen-logo-mark {
        width: 48px;
        height: 48px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(255, 255, 255, 0.68);
        box-shadow: 0 12px 30px rgba(116, 171, 150, 0.12);
        color: #18b986;
        font-size: 1.35rem;
      }

      .zen-brand-title {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .zen-brand h1 {
        margin: 0;
        font-size: clamp(1.25rem, 2vw, 1.65rem);
        line-height: 1;
        letter-spacing: 0;
      }

      .zen-version {
        display: inline-flex;
        align-items: center;
        height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(19, 201, 139, 0.12);
        color: #12b57f;
        font-size: 0.78rem;
        font-weight: 800;
      }

      .zen-tagline {
        margin: 6px 0 0;
        color: var(--zen-muted);
        font-size: 0.88rem;
        font-weight: 600;
      }

      .zen-header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .zen-pill {
        min-height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 16px;
        border: 1px solid rgba(220, 229, 238, 0.8);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.68);
        box-shadow: 0 10px 24px rgba(105, 122, 145, 0.07);
        color: #526176;
        font-size: 0.84rem;
        font-weight: 800;
      }

      .zen-icon-button {
        width: 44px;
        height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(220, 229, 238, 0.84);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.74);
        box-shadow: 0 12px 28px rgba(105, 122, 145, 0.1);
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }

      .zen-icon-button:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 16px 34px rgba(105, 122, 145, 0.14);
      }

      .zen-card {
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.75);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 8px 32px 0 rgba(142, 153, 165, 0.06);
      }

      .zen-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .zen-card-title {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin: 0;
        font-size: 1.02rem;
        font-weight: 850;
      }

      .zen-card-icon {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: rgba(239, 246, 244, 0.86);
        color: #13b984;
      }

      .zen-core-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 22px;
      }

      .zen-focus-card,
      .zen-breath-card,
      .zen-window-card {
        min-height: 360px;
        padding: 28px;
      }

      .zen-focus-body,
      .zen-breath-body {
        height: calc(100% - 34px);
        display: grid;
        place-items: center;
        align-content: center;
        gap: 28px;
      }

      .zen-status-tag {
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(255, 126, 151, 0.1);
        color: #eb5674;
        font-size: 0.78rem;
        font-weight: 850;
      }

      .zen-status-tag.is-active {
        background: rgba(19, 201, 139, 0.12);
        color: #0fa978;
        animation: focusPulse 1.4s ease-in-out infinite;
      }

      .zen-timer-ring {
        --progress: 0deg;
        width: 128px;
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background:
          radial-gradient(circle at center, rgba(255, 255, 255, 0.96) 0 58%, transparent 59%),
          conic-gradient(var(--zen-green) var(--progress), rgba(230, 238, 244, 0.88) 0);
        box-shadow:
          inset 0 0 0 1px rgba(220, 229, 238, 0.7),
          0 16px 34px rgba(118, 140, 162, 0.1);
      }

      .zen-timer-ring.is-breathing {
        animation: timerBreathe 2.4s ease-in-out infinite;
      }

      .zen-timer-time {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      #pomodoroTime {
        font-size: 1.65rem;
        font-weight: 900;
        letter-spacing: 0;
      }

      .zen-timer-state {
        color: #8a98aa;
        font-size: 0.72rem;
        font-weight: 900;
        letter-spacing: 0.12em;
      }

      .zen-control-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
      }

      .zen-primary-button {
        min-width: 136px;
        height: 44px;
        border: none;
        border-radius: 14px;
        background: linear-gradient(180deg, #15d598, #0fc487);
        color: white;
        font-weight: 900;
        cursor: pointer;
        box-shadow: 0 16px 30px rgba(19, 201, 139, 0.24);
      }

      .zen-soft-button {
        min-width: 42px;
        height: 42px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(220, 229, 238, 0.82);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.76);
        color: #6b7a90;
        font-weight: 900;
        cursor: pointer;
      }

      .zen-breath-orb {
        width: 96px;
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        border-radius: 50%;
        color: #82a0b5;
        background:
          radial-gradient(circle at 42% 36%, rgba(255, 255, 255, 0.95), rgba(235, 247, 245, 0.82)),
          linear-gradient(135deg, rgba(19, 201, 139, 0.16), rgba(105, 188, 229, 0.14));
        border: 1px solid rgba(224, 235, 238, 0.9);
        box-shadow: 0 24px 58px rgba(112, 146, 160, 0.14);
        animation: breathGuide 7.5s ease-in-out infinite;
      }

      .zen-breath-copy {
        text-align: center;
      }

      .zen-breath-copy strong {
        display: block;
        margin-bottom: 8px;
        font-size: 1.03rem;
      }

      .zen-breath-copy span {
        color: var(--zen-muted);
        font-size: 0.84rem;
        font-weight: 700;
      }

      .zen-window-card {
        overflow: hidden;
      }

      .zen-window-scene {
        position: relative;
        height: 260px;
        margin-top: 20px;
        overflow: hidden;
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.08)),
          linear-gradient(135deg, #c6a990 0%, #8d6958 48%, #574b46 100%);
        box-shadow: inset 0 -40px 70px rgba(42, 31, 27, 0.28);
      }

      .zen-window-scene::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, transparent 0 20%, rgba(45, 34, 31, 0.3) 20% 22%, transparent 22% 100%),
          radial-gradient(circle at 78% 18%, rgba(245, 226, 178, 0.72), transparent 7%),
          radial-gradient(circle at 38% 58%, rgba(244, 215, 184, 0.34), transparent 18%),
          repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0 1px, transparent 1px 28px);
        opacity: 0.72;
      }

      .zen-window-scene::after {
        content: "";
        position: absolute;
        left: 12%;
        right: 12%;
        bottom: 18%;
        height: 36%;
        border-radius: 18px 18px 4px 4px;
        background:
          radial-gradient(circle at 72% 30%, #20304a 0 8px, transparent 9px),
          linear-gradient(90deg, #684b43, #a77d67 55%, #5a4440);
        box-shadow:
          78px -24px 0 -18px rgba(56, 80, 58, 0.88),
          112px -38px 0 -26px rgba(56, 80, 58, 0.7),
          -56px -52px 0 -28px rgba(255, 232, 150, 0.82);
      }

      .zen-window-status {
        position: absolute;
        left: 18px;
        right: 18px;
        bottom: 16px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.78);
        color: #5b6574;
        font-size: 0.85rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }

      .zen-section {
        margin-top: 34px;
      }

      .zen-section-heading {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 16px;
        margin: 0 0 18px;
      }

      .zen-section-heading h2 {
        margin: 0;
        font-size: clamp(1.35rem, 2.2vw, 1.8rem);
      }

      .zen-section-heading p {
        margin: 6px 0 0;
        color: var(--zen-muted);
        font-weight: 700;
      }

      .zen-mokugyo-card {
        position: relative;
        min-height: 220px;
        padding: 28px;
        overflow: hidden;
      }

      .zen-mokugyo-stage {
        height: 128px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
      }

      .zen-mokugyo-core {
        position: relative;
        width: 86px;
        height: 70px;
        display: grid;
        place-items: center;
        border-radius: 22px;
        background: linear-gradient(135deg, #fff9dc, #fff2b5);
        border: 1px solid rgba(236, 221, 154, 0.72);
        box-shadow: 0 20px 46px rgba(203, 167, 73, 0.16);
        color: #8f50e4;
        font-size: 2.2rem;
        transition: transform 0.18s ease;
      }

      .zen-mokugyo-core.is-hit {
        animation: mokugyoHit 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .zen-merit-pop {
        position: absolute;
        top: -18px;
        right: -10px;
        color: #f6a23d;
        font-size: 0.9rem;
        font-weight: 950;
        opacity: 0;
        transform: translateY(8px);
      }

      .zen-merit-pop.is-visible {
        animation: meritPop 0.58s ease-out;
      }

      .zen-progress-line {
        position: absolute;
        left: 28px;
        right: 28px;
        bottom: 26px;
        height: 6px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(233, 238, 244, 0.85);
      }

      .zen-progress-fill {
        width: calc(var(--energy-intensity) * 100%);
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(19, 201, 139, 0.34), rgba(246, 162, 61, 0.78));
        transition: width 0.16s ease;
      }

      .zen-track-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 18px;
      }

      .zen-sound-card {
        min-height: 170px;
        padding: 22px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
      }

      .zen-sound-card.is-playing {
        border-color: rgba(19, 201, 139, 0.38);
        box-shadow: 0 18px 45px rgba(19, 201, 139, 0.09);
      }

      .zen-sound-card:hover {
        transform: translateY(-2px);
      }

      .zen-sound-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .zen-track-icon {
        width: 40px;
        height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        background: rgba(246, 249, 252, 0.9);
        color: #91a5bd;
        font-size: 1.15rem;
        font-weight: 900;
      }

      .zen-play-button {
        width: 42px;
        height: 42px;
        border: 1px solid rgba(220, 229, 238, 0.9);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.82);
        color: #34445d;
        cursor: pointer;
        font-size: 0.95rem;
        font-weight: 900;
      }

      .zen-sound-card.is-playing .zen-play-button {
        color: white;
        background: var(--zen-green);
        border-color: rgba(19, 201, 139, 0.4);
      }

      .zen-sound-card h3 {
        margin: 18px 0 8px;
        font-size: 1.08rem;
      }

      .zen-sound-card p {
        margin: 0;
        color: #65748a;
        font-size: 0.9rem;
        font-weight: 650;
        line-height: 1.45;
      }

      .zen-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }

      .zen-tags span {
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(239, 244, 248, 0.92);
        color: #7c8ba0;
        font-size: 0.74rem;
        font-weight: 850;
      }

      .fs-player-shell {
        margin-top: 22px;
        pointer-events: auto;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.75);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 8px 32px 0 rgba(142, 153, 165, 0.06);
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
        gap: 14px;
        padding: 16px 18px;
      }

      .fs-player-label {
        font-size: 0.74rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #93a0b1;
        font-weight: 900;
      }

      .fs-player-title {
        margin-top: 4px;
        color: #2d3a51;
        font-weight: 850;
      }

      .fs-player-actions {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .fs-player-link,
      .fs-player-toggle {
        border: 1px solid rgba(220, 229, 238, 0.9);
        border-radius: 999px;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.78);
        color: #526176;
        text-decoration: none;
        font-weight: 850;
      }

      .fs-player-link {
        padding: 9px 14px;
        font-size: 0.82rem;
      }

      .fs-player-toggle {
        width: 34px;
        height: 34px;
      }

      .fs-player-body {
        padding: 0 18px 18px;
      }

      .fs-player-frame-wrap {
        overflow: hidden;
        border-radius: 14px;
        border: 1px solid rgba(220, 229, 238, 0.8);
        background: white;
      }

      .fs-player-iframe {
        display: block;
        width: 100%;
        border: none;
        background: transparent;
      }

      .fs-player-note {
        margin: 10px 2px 0;
        color: #748298;
        font-size: 0.82rem;
        line-height: 1.55;
      }

      .zen-footer {
        width: min(640px, 100%);
        margin: 70px auto 0;
        padding: 28px;
        text-align: center;
      }

      .zen-footer strong {
        display: block;
        margin-bottom: 22px;
        color: #44536b;
        font-size: 1.08rem;
      }

      .zen-footer-links {
        display: flex;
        justify-content: center;
        gap: 34px;
        color: #59687d;
        font-size: 0.9rem;
        font-weight: 850;
      }

      .fs-settings-backdrop {
        position: fixed;
        inset: 0;
        z-index: 18;
        background: rgba(222, 235, 232, 0.38);
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
        width: min(430px, calc(100vw - 18px));
        height: 100vh;
        z-index: 20;
        padding: 28px 24px 24px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        overflow-y: auto;
        border-left: 1px solid rgba(255, 255, 255, 0.62);
        background: rgba(255, 255, 255, 0.78);
        backdrop-filter: blur(24px) saturate(135%);
        -webkit-backdrop-filter: blur(24px) saturate(135%);
        box-shadow: -24px 0 60px rgba(105, 122, 145, 0.12);
        transform: translateX(100%);
        transition: transform 0.34s cubic-bezier(0.4, 0, 0.2, 1);
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
        font-weight: 900;
        color: #24324a;
      }

      .fs-settings-close {
        width: 38px;
        height: 38px;
        border: 1px solid rgba(220, 229, 238, 0.84);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.74);
        color: #5f6e82;
        cursor: pointer;
      }

      .fs-settings-copy {
        margin: 0;
        color: #6f7e92;
        line-height: 1.6;
        font-size: 0.92rem;
      }

      .fs-settings-section {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 18px;
        border: 1px solid rgba(255, 255, 255, 0.56);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.58);
        box-shadow: 0 8px 24px rgba(142, 153, 165, 0.05);
      }

      .fs-settings-section-title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 900;
        color: #27364f;
      }

      .fs-settings-section-hint,
      .fs-inline-hint {
        margin: -4px 0 0;
        color: #748298;
        font-size: 0.84rem;
        line-height: 1.55;
      }

      .fs-radio-list {
        display: grid;
        gap: 10px;
      }

      .fs-radio-option {
        display: flex;
        gap: 12px;
        padding: 13px;
        border: 1px solid rgba(220, 229, 238, 0.72);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.52);
        cursor: pointer;
      }

      .fs-radio-option input {
        margin-top: 3px;
        accent-color: var(--zen-green);
      }

      .fs-radio-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .fs-radio-label {
        font-weight: 850;
        color: #2d3a51;
      }

      .fs-radio-description {
        color: #748298;
        font-size: 0.82rem;
        line-height: 1.5;
      }

      .fs-field {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }

      .fs-label {
        color: #8492a7;
        font-size: 0.76rem;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .fs-input {
        width: 100%;
        padding: 13px 15px;
        border: 1px solid rgba(220, 229, 238, 0.86);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.78);
        color: #27364f;
        outline: none;
      }

      .fs-input::placeholder {
        color: #a9b4c3;
      }

      .fs-input:focus {
        border-color: rgba(19, 201, 139, 0.38);
        box-shadow: 0 0 0 4px rgba(19, 201, 139, 0.08);
      }

      .fs-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .fs-select {
        appearance: none;
        background-image:
          linear-gradient(45deg, transparent 50%, #8492a7 50%),
          linear-gradient(135deg, #8492a7 50%, transparent 50%);
        background-position:
          calc(100% - 21px) calc(50% - 2px),
          calc(100% - 15px) calc(50% - 2px);
        background-size: 6px 6px, 6px 6px;
        background-repeat: no-repeat;
        padding-right: 42px;
      }

      .fs-error-text {
        min-height: 18px;
        margin: 0;
        color: #d65b6f;
        font-size: 0.8rem;
        line-height: 1.55;
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
        font-weight: 850;
        cursor: pointer;
      }

      .fs-button-secondary {
        background: rgba(239, 244, 248, 0.9);
        color: #526176;
      }

      .fs-button-primary {
        background: var(--zen-green);
        color: white;
        box-shadow: 0 14px 28px rgba(19, 201, 139, 0.2);
      }

      @keyframes breathGuide {
        0%, 100% { transform: scale(0.86); box-shadow: 0 14px 34px rgba(112, 146, 160, 0.1); }
        46% { transform: scale(1.18); box-shadow: 0 26px 66px rgba(19, 201, 139, 0.18); }
      }

      @keyframes timerBreathe {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.035); }
      }

      @keyframes focusPulse {
        0%, 100% { opacity: 0.65; }
        50% { opacity: 1; }
      }

      @keyframes mokugyoHit {
        0% { transform: scale(1); }
        38% { transform: scale(1.18) rotate(-2deg); }
        100% { transform: scale(1); }
      }

      @keyframes meritPop {
        0% { opacity: 0; transform: translateY(8px) scale(0.8); }
        25% { opacity: 1; }
        100% { opacity: 0; transform: translateY(-26px) scale(1.08); }
      }

      @media (max-width: 1100px) {
        .zen-core-grid {
          grid-template-columns: 1fr;
        }

        .zen-focus-card,
        .zen-breath-card,
        .zen-window-card {
          min-height: 300px;
        }

        .zen-track-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 680px) {
        .zen-page {
          padding: 16px 14px 38px;
        }

        .zen-header {
          position: relative;
          align-items: flex-start;
          flex-direction: column;
        }

        .zen-header-actions {
          width: 100%;
          justify-content: space-between;
        }

        .zen-pill {
          display: none;
        }

        .zen-track-grid {
          grid-template-columns: 1fr;
        }

        .zen-section-heading {
          align-items: flex-start;
          flex-direction: column;
        }

        .fs-settings-panel {
          width: 100vw;
        }

        .fs-settings-footer {
          flex-direction: column-reverse;
        }
      }
    </style>
    <main class="zen-page">
      <div class="zen-shell">
        <header class="zen-header">
          <div class="zen-brand">
            <div class="zen-logo-mark">⌁</div>
            <div>
              <div class="zen-brand-title">
                <h1>FlowSpace</h1>
                <span class="zen-version">ZEN 2.0</span>
              </div>
              <p class="zen-tagline">让声音带你远离喧嚣，找到内心的宁静</p>
            </div>
          </div>
          <div class="zen-header-actions">
            <span id="audioModeStatus" class="zen-pill">智能天气音 · 自动定位</span>
            <button id="startAudioBtn" class="zen-icon-button" type="button" aria-label="启动音频">▶</button>
            <button id="settingsToggleBtn" class="zen-icon-button" type="button" aria-label="打开设置">⚙</button>
          </div>
        </header>

        <section class="zen-core-grid">
          <article class="zen-card zen-focus-card">
            <div class="zen-card-header">
              <h2 class="zen-card-title"><span class="zen-card-icon">◴</span>番茄专注</h2>
              <span id="focusStatusTag" class="zen-status-tag">专注期</span>
            </div>
            <div class="zen-focus-body">
              <div id="pomodoroRing" class="zen-timer-ring">
                <div class="zen-timer-time">
                  <span id="pomodoroTime">25:00</span>
                  <span id="pomodoroState" class="zen-timer-state">PAUSED</span>
                </div>
              </div>
              <div class="zen-control-row">
                <button id="pomodoroToggleBtn" class="zen-primary-button" type="button">开始</button>
                <button id="pomodoroResetBtn" class="zen-soft-button" type="button" aria-label="重置番茄钟">↻</button>
              </div>
            </div>
          </article>

          <article class="zen-card zen-breath-card">
            <div class="zen-card-header">
              <h2 class="zen-card-title"><span class="zen-card-icon">≋</span>呼吸正念</h2>
            </div>
            <div class="zen-breath-body">
              <div class="zen-breath-orb">≋</div>
              <p class="zen-breath-copy">
                <strong>准备好了吗?</strong>
                <span>跟随圆圈，进行 4-7-8 呼吸冥想</span>
              </p>
            </div>
          </article>

          <article class="zen-card zen-window-card">
            <div class="zen-card-header">
              <h2 class="zen-card-title"><span class="zen-card-icon">▣</span>宁静窗景</h2>
              <span class="zen-pill">DAY</span>
            </div>
            <div class="zen-window-scene" aria-label="雨中房间插画">
              <div id="windowThemeStatus" class="zen-window-status">RAIN IN MORNING</div>
            </div>
          </article>
        </section>

        <section class="zen-section">
          <article class="zen-card zen-mokugyo-card">
            <div class="zen-card-header">
              <h2 class="zen-card-title"><span class="zen-card-icon">♡</span>电子木鱼</h2>
              <span class="zen-pill">功德 <span id="meritCount">0</span></span>
            </div>
            <div class="zen-mokugyo-stage">
              <div id="mokugyoCore" class="zen-mokugyo-core">
                ◒
                <span id="meritPop" class="zen-merit-pop">+1</span>
              </div>
              <div class="zen-control-row">
                <button id="mokugyoPlayBtn" class="zen-soft-button" type="button" aria-label="敲击木鱼">▶</button>
                <button id="mokugyoResetBtn" class="zen-soft-button" type="button" aria-label="重置功德">↻</button>
              </div>
            </div>
            <div class="zen-progress-line"><div class="zen-progress-fill"></div></div>
          </article>
        </section>

        <section class="zen-section">
          <div class="zen-section-heading">
            <div>
              <h2>精选组合</h2>
              <p>统一为玻璃拟态音景胶囊，避免与整体视觉割裂</p>
            </div>
            <span class="zen-pill">SOUND MOODS</span>
          </div>
          <div id="featuredTracksGrid" class="zen-track-grid"></div>
        </section>

        <section class="zen-section">
          <div class="zen-section-heading">
            <div>
              <h2>声音调音台</h2>
              <p>轻触开启音景，保持卡片密度与统一玻璃质感</p>
            </div>
            <span class="zen-pill">MIXER</span>
          </div>
          <div id="mixerTracksGrid" class="zen-track-grid"></div>
          <section id="playlistPlayerShell" class="fs-player-shell" aria-hidden="true">
            <div class="fs-player-header">
              <div>
                <div class="fs-player-label">External Playlist</div>
                <div id="playlistPlayerTitle" class="fs-player-title"></div>
              </div>
              <div class="fs-player-actions">
                <a id="playlistPlayerLink" class="fs-player-link" href="#" target="_blank" rel="noreferrer">打开平台页</a>
                <button id="playlistPlayerToggle" class="fs-player-toggle" type="button" aria-label="折叠播放器">▾</button>
              </div>
            </div>
            <div id="playlistPlayerBody" class="fs-player-body"></div>
          </section>
        </section>

        <footer class="zen-card zen-footer">
          <strong>让声音带你远离喧嚣，找到内心的宁静 ✿</strong>
          <div class="zen-footer-links">
            <span>关于我们</span>
            <span>使用条款</span>
            <span>隐私政策</span>
          </div>
        </footer>
      </div>
    </main>

    <div id="settingsBackdrop" class="fs-settings-backdrop"></div>
    <aside id="settingsPanel" class="fs-settings-panel" aria-hidden="true">
      <div class="fs-settings-header">
        <h2 class="fs-settings-heading">配置面板</h2>
        <button id="settingsCloseBtn" class="fs-settings-close" type="button" aria-label="关闭设置">×</button>
      </div>
      <p class="fs-settings-copy">配置背景环境音来源，并接入第三方歌单。所有变化只作用于前端视图与音频层。</p>

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
          <input id="playlistInput" class="fs-input" type="text" placeholder="请输入您的歌单 ID 或官方分享链接" maxlength="240" />
        </div>
        <p id="playlistInputHint" class="fs-inline-hint">支持直接粘贴官方分享链接；Apple Music 建议使用完整分享链接。</p>
        <p id="playlistErrorText" class="fs-error-text"></p>
      </section>

      <div class="fs-settings-footer">
        <button id="settingsCancelBtn" class="fs-button-secondary" type="button">取消</button>
        <button id="settingsSaveBtn" class="fs-button-primary" type="button">保存设置</button>
      </div>
    </aside>
  `;

  renderTrackGrid('featuredTracksGrid', featuredTracks);
  renderTrackGrid('mixerTracksGrid', mixerTracks);
  bindInteractionEvents();
  bindSettingsPanelEvents();
  syncSettingsUI();
  updatePomodoroUI();
  requestAnimationFrame(animateEnergy);
}

function renderTrackGrid(containerId: string, tracks: MixerTrack[]) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  container.innerHTML = tracks
    .map(
      (track) => `
        <article class="zen-card zen-sound-card" data-track-id="${track.id}">
          <div>
            <div class="zen-sound-top">
              <span class="zen-track-icon">${track.icon}</span>
              <button class="zen-play-button" type="button" data-track-toggle="${track.id}" aria-label="播放 ${track.title}">▷</button>
            </div>
            <h3>${track.title}</h3>
            <p>${track.description}</p>
          </div>
          <div class="zen-tags">${track.tags.map((tag) => `<span>${tag}</span>`).join('')}</div>
        </article>
      `,
    )
    .join('');
}

function bindInteractionEvents() {
  document.getElementById('startAudioBtn')?.addEventListener('click', async () => {
    audioManager.setAudioConfig(audioConfig);
    await audioManager.start();
    const button = document.getElementById('startAudioBtn');
    if (button) {
      button.textContent = '✓';
      button.setAttribute('aria-label', '音频已启动');
    }
  });

  document.getElementById('pomodoroToggleBtn')?.addEventListener('click', togglePomodoro);
  document.getElementById('pomodoroResetBtn')?.addEventListener('click', resetPomodoro);
  document.getElementById('mokugyoPlayBtn')?.addEventListener('click', triggerMokugyo);
  document.getElementById('mokugyoResetBtn')?.addEventListener('click', () => {
    meritCount = 0;
    updateMeritUI();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-track-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const track = [...mixerTracks].find((item) => item.id === button.dataset.trackToggle);
      if (track) {
        toggleMixerTrack(track);
      }
    });
  });
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
    const id = extractFirstMatch(
      [/interactive_playlist\.html\?id=(\d+)/i, /playlist\/(\d+)/i, /id=(\d+)/i, /^(\d+)$/i],
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
  const windowThemeStatus = document.getElementById('windowThemeStatus');
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

  if (windowThemeStatus) {
    windowThemeStatus.textContent = audioConfig.sourceType === 'default' ? 'PURE FOCUS NOISE' : 'RAIN IN MORNING';
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

function togglePomodoro() {
  isPomodoroRunning = !isPomodoroRunning;

  if (isPomodoroRunning) {
    pomodoroTimer = window.setInterval(() => {
      pomodoroSeconds = Math.max(0, pomodoroSeconds - 1);
      if (pomodoroSeconds === 0) {
        isPomodoroRunning = false;
        if (pomodoroTimer !== null) {
          window.clearInterval(pomodoroTimer);
          pomodoroTimer = null;
        }
      }
      updatePomodoroUI();
    }, 1000);
  } else if (pomodoroTimer !== null) {
    window.clearInterval(pomodoroTimer);
    pomodoroTimer = null;
  }

  updatePomodoroUI();
}

function resetPomodoro() {
  isPomodoroRunning = false;
  pomodoroSeconds = 25 * 60;
  if (pomodoroTimer !== null) {
    window.clearInterval(pomodoroTimer);
    pomodoroTimer = null;
  }
  updatePomodoroUI();
}

function updatePomodoroUI() {
  const minutes = Math.floor(pomodoroSeconds / 60);
  const seconds = pomodoroSeconds % 60;
  const time = document.getElementById('pomodoroTime');
  const state = document.getElementById('pomodoroState');
  const button = document.getElementById('pomodoroToggleBtn');
  const ring = document.getElementById('pomodoroRing');
  const elapsed = 25 * 60 - pomodoroSeconds;
  const progress = Math.min(360, (elapsed / (25 * 60)) * 360);

  if (time) {
    time.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  if (state) {
    state.textContent = isPomodoroRunning ? 'FOCUS' : 'PAUSED';
  }

  if (button) {
    button.textContent = isPomodoroRunning ? '暂停' : '开始';
  }

  if (ring) {
    ring.style.setProperty('--progress', `${progress}deg`);
  }
}

function animateEnergy() {
  currentEnergy += (targetEnergy - currentEnergy) * 0.12;
  document.documentElement.style.setProperty('--energy-intensity', currentEnergy.toFixed(3));

  const shouldBreathe = !isPomodoroRunning && currentEnergy > 0.02;
  document.getElementById('pomodoroRing')?.classList.toggle('is-breathing', shouldBreathe);
  document.getElementById('focusStatusTag')?.classList.toggle('is-active', currentEnergy > 0.04);
  audioManager.updateEnergy(currentEnergy);

  const now = window.performance.now();
  const isEnergySpike = currentEnergy - previousEnergy > 0.08;
  const isHighEnergyPulse = currentEnergy > 0.72 && now - lastAutoMokugyoAt > 320;
  if (isEnergySpike || isHighEnergyPulse) {
    lastAutoMokugyoAt = now;
    triggerMokugyo();
  }

  previousEnergy = currentEnergy;
  requestAnimationFrame(animateEnergy);
}

function setEnergyTarget(energy: number) {
  targetEnergy = Math.max(0, Math.min(1, energy));
}

function triggerMokugyo() {
  meritCount += 1;
  updateMeritUI();
  playMokugyoSound();

  const core = document.getElementById('mokugyoCore');
  const pop = document.getElementById('meritPop');
  core?.classList.remove('is-hit');
  pop?.classList.remove('is-visible');
  window.requestAnimationFrame(() => {
    core?.classList.add('is-hit');
    pop?.classList.add('is-visible');
  });
}

function updateMeritUI() {
  const count = document.getElementById('meritCount');
  if (count) {
    count.textContent = String(meritCount);
  }
}

function playMokugyoSound() {
  const AudioContextClass = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  if (!mokugyoAudioContext) {
    mokugyoAudioContext = new AudioContextClass();
  }

  if (mokugyoAudioContext.state === 'suspended') {
    void mokugyoAudioContext.resume();
  }

  const now = mokugyoAudioContext.currentTime;
  const oscillator = mokugyoAudioContext.createOscillator();
  const gain = mokugyoAudioContext.createGain();
  const filter = mokugyoAudioContext.createBiquadFilter();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.exponentialRampToValueAtTime(430, now + 0.12);
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(760, now);
  filter.Q.setValueAtTime(6, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(mokugyoAudioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
}

function toggleMixerTrack(track: MixerTrack) {
  const existing = activeMixerTracks.get(track.id);
  if (existing) {
    existing.pause();
    existing.src = '';
    activeMixerTracks.delete(track.id);
    updateTrackPlayingState(track.id, false);
    return;
  }

  const audio = new Audio(createAmbientLoopDataUri(track));
  audio.loop = true;
  audio.volume = 0.28;
  audio.play().catch((error: unknown) => {
    console.error('Mixer track playback failed:', error);
    activeMixerTracks.delete(track.id);
    updateTrackPlayingState(track.id, false);
  });
  activeMixerTracks.set(track.id, audio);
  updateTrackPlayingState(track.id, true);
}

function updateTrackPlayingState(trackId: string, isPlaying: boolean) {
  document.querySelectorAll<HTMLElement>(`[data-track-id="${trackId}"]`).forEach((card) => {
    card.classList.toggle('is-playing', isPlaying);
  });

  document.querySelectorAll<HTMLButtonElement>(`[data-track-toggle="${trackId}"]`).forEach((button) => {
    button.textContent = isPlaying ? 'Ⅱ' : '▷';
  });
}

function createAmbientLoopDataUri(track: MixerTrack): string {
  const sampleRate = 8000;
  const duration = 4;
  const totalSamples = sampleRate * duration;
  const dataSize = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let random = seededNoise(track.id);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const wave = Math.sin(Math.PI * 2 * track.frequency * t) * 0.14;
    const lfo = Math.sin(Math.PI * 2 * track.modulation * t) * 0.5 + 0.5;
    const noise = (random() * 2 - 1) * track.noise * 0.22;
    const sample = Math.max(-1, Math.min(1, (wave * (0.35 + lfo * 0.45) + noise) * 0.5));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function seededNoise(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    console.error('Startup weather fetch failed, fallback to wind ambience:', error);
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

async function bindFlowEnergyEvents() {
  await listen<number>('flow-energy-update', (event) => {
    setEnergyTarget(event.payload);
  });

  await listen<number>('flow-energy-tick', (event) => {
    setEnergyTarget(event.payload);
  });
}

async function main() {
  createUI();

  const isTauri = typeof window !== 'undefined' && (window as Window & typeof globalThis & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

  await loadStartupWeather(Boolean(isTauri));

  if (isTauri) {
    try {
      await bindFlowEnergyEvents();
    } catch (error) {
      console.error('Tauri event listener failed:', error);
    }
  }
}

main();
