<p align="center">
  <img src="src-tauri/icons/icon.png" alt="FlowSpace" width="120" />
</p>

<h1 align="center">FlowSpace</h1>

<p align="center">
  <strong>Immersive Productivity Companion</strong><br/>
  Turn typing momentum into responsive visuals and adaptive ambient audio.
</p>

<p align="center">
  English &nbsp;|&nbsp; <a href="README_zh.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/tauri-v2-24C8DB?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Rust-1.x-DEA584?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Three.js-0.185-000000?logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## What is FlowSpace?

FlowSpace is a desktop productivity tool that creates an immersive focus atmosphere by translating your real-time typing intensity into **dynamic 3D visuals** and **adaptive ambient audio**. It runs quietly in the background, listens to your keyboard globally, and mirrors your focus state — without breaking your flow.

When you type fast, the starfield accelerates, bloom intensifies, and the ambient audio filter opens up. When you pause, everything gently settles.

## Core Features

- **Real-time Flow Energy** — Rust backend monitors global keyboard input, computes a Flow Energy score (0.0–1.0) with exponential decay, and pushes it to the frontend every 100ms.
- **3D Starfield Visual** — Built with Three.js and UnrealBloomPass. Stars drift, bloom, and shift color with energy. Click to enter the stargazing phase; drag to explore.
- **Adaptive Ambient Audio** — Procedural noise processed through Web Audio API filters. Cutoff frequency and gain dynamically track your typing energy. Weather-aware presets (rain / wind / storm) match real-world conditions.
- **Multi-track Audio Mixer** — Layer your own ambient tracks across three categories: Nature, Rain, Animals. Toggle, adjust volume, and favorite individual tracks.
- **Smart Weather Integration** — Auto-detects your location (IP + device geolocation), fetches live weather data from Open-Meteo, and selects the appropriate ambient profile. Supports custom weather overrides (e.g. "Tokyo", "雷暴").
- **External Playlist Embedding** — Embed playlists from NetEase Music, QQ Music, Apple Music, or Kugou Music directly into the workspace via iframe.
- **macOS Permission Wizard** — Step-by-step guidance for granting Accessibility and Input Monitoring permissions, with live status detection and shortcuts to System Settings.
- **Render Lifecycle Management** — Automatically pauses rendering when the window loses focus or is hidden, saving GPU resources.

## Tech Stack

| Layer        | Technology                                                   |
| :----------- | :----------------------------------------------------------- |
| Desktop Shell| [Tauri v2](https://tauri.app/)                               |
| Backend      | Rust (`device_query`, `reqwest`, `tokio`, `parking_lot`, `core-foundation`) |
| Frontend     | TypeScript, Vite                                             |
| 3D Rendering | [Three.js](https://threejs.org/) + EffectComposer + UnrealBloomPass |
| Audio        | Web Audio API (procedural noise synthesis, BiquadFilter, GainNode) |
| Styling      | Hand-crafted CSS (no framework), glassmorphism + dark theme  |
| Weather API  | [Open-Meteo](https://open-meteo.com/) (free, no API key)     |
| Geolocation  | [ipapi.co](https://ipapi.co/) + Browser Geolocation API      |

## Getting Started

### Prerequisites

- **Rust** (install via [rustup](https://rustup.rs/))
- **Node.js** >= 18
- **macOS** (current primary target; Windows/Linux support depends on Tauri and `device_query` compatibility)
- **macOS Permissions**: FlowSpace requires **Accessibility** and **Input Monitoring** permissions for global keyboard listening. The app will guide you through granting these on first launch.

### Development

```bash
# Clone the repository
git clone https://github.com/your-org/FlowSpace.git
cd FlowSpace

# Install frontend dependencies
npm install

# Start Tauri dev server
npm run tauri dev
```

On first launch, you'll see the welcome starfield. Grant the requested macOS permissions when prompted, then click the starfield to enter the workspace.

### Build

```bash
npm run tauri build
```

The bundled `.app` will be in `src-tauri/target/release/bundle/`.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Tauri Desktop Shell                  │
├──────────────────────┬───────────────────────────────┤
│   Rust Backend        │   TypeScript Frontend         │
│                        │                               │
│  ┌──────────────────┐ │  ┌─────────────────────────┐  │
│  │ Keyboard Listener │ │  │  Three.js Starfield     │  │
│  │  (device_query)   │ │  │  + UnrealBloomPass      │  │
│  └────────┬─────────┘ │  └─────────────────────────┘  │
│           │            │                               │
│  ┌────────▼─────────┐ │  ┌─────────────────────────┐  │
│  │  Flow State      │ │  │  Web Audio Engine        │  │
│  │  (WPM + decay)   │─┼─▶│  (procedural noise +     │  │
│  └────────┬─────────┘ │  │   energy-reactive filter) │  │
│           │            │  └─────────────────────────┘  │
│  ┌────────▼─────────┐ │  ┌─────────────────────────┐  │
│  │  Weather Service │ │  │  Audio Mixer UI          │  │
│  │  (Open-Meteo)    │─┼─▶│  (multi-track, volume,    │  │
│  └──────────────────┘ │  │   favorites, categories)  │  │
│                        │  └─────────────────────────┘  │
│  ┌──────────────────┐ │  ┌─────────────────────────┐  │
│  │  Permission Mgr  │ │  │  Settings Panel          │  │
│  │  (macOS TCC)     │─┼─▶│  (audio source, weather  │  │
│  └──────────────────┘ │  │   override, playlists)    │  │
│                        │  └─────────────────────────┘  │
└────────────────────────┴───────────────────────────────┘
```

### Flow Energy Algorithm

1. Every keyboard stroke is recorded with a timestamp.
2. Each 100ms tick: count strokes within the past 5 seconds.
3. **WPM** = `(stroke_count / 5) x (60 / 5)` (5 strokes approx 1 word).
4. **Raw energy** = `min(WPM / 120, 1.0)` (120 WPM maps to peak energy).
5. **Decay**: if no new strokes arrive, energy multiplies by **0.95** each tick.
6. The result is emitted to the frontend via Tauri IPC.

## Project Structure

```
FlowSpace/
├── src/                          # Frontend source (TypeScript)
│   ├── main.ts                   # Entry point, UI, event handling, IPC
│   ├── audio/
│   │   └── AudioManager.ts       # Web Audio API engine
│   └── visual/
│       └── VisualManager.ts      # Three.js starfield scene
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri window & bundle config
│   └── src/
│       └── main.rs               # Flow state machine, keyboard listener,
│                                 #   weather service, macOS permissions
├── public/nature/                # Ambient audio assets (*.mp3)
├── index.html                    # Vite entry HTML
├── package.json                  # Node dependencies & scripts
├── tsconfig.json                 # TypeScript config
└── vite.config.ts                # Vite config
```

## Permissions

FlowSpace needs two macOS privacy permissions to monitor global keyboard input:

- **Accessibility** — allows the app to receive system-wide keyboard events.
- **Input Monitoring** — a secondary permission required on macOS 10.15+ for keyboard event taps.

The app includes a permission banner that guides you through authorizing both. You can also grant them manually in **System Settings -> Privacy & Security**.

Without these permissions, the core flow-energy feature will not function, but all other features (visuals, audio mixer, weather, playlists) remain available.

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built with Rust, TypeScript, and the conviction that the right atmosphere makes deep work inevitable.</sub>
</p>
