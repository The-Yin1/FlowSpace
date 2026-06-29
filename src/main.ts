import { listen } from '@tauri-apps/api/event';
import { AudioManager } from './audio/AudioManager';
import { VisualManager } from './visual/VisualManager';

const audioManager = new AudioManager();
let visualManager: VisualManager | null = null;

function createUI() {
  const app = document.getElementById('app') as HTMLDivElement;
  app.innerHTML = `
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
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      opacity: 0;
      transition: opacity 0.5s ease;
    ">
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        text-align: center;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
      ">
        <h1 style="
          font-size: 2rem;
          margin-bottom: 1rem;
          margin-top: 0;
          font-weight: 700;
        ">FlowSpace</h1>
        <div id="energyValue" style="
          font-size: 4rem;
          font-weight: bold;
          text-shadow: 0 0 30px rgba(102, 126, 234, 0.8);
        ">
          0.0%
        </div>
        <div style="
          font-size: 1.2rem;
          opacity: 0.8;
          margin-top: 0.5rem;
        ">
          Flow Energy
        </div>
        <div id="audioBtnContainer" style="pointer-events: auto; margin-top: 2rem;">
          <button id="startAudioBtn" style="
            padding: 1rem 2rem;
            font-size: 1.2rem;
            border: none;
            border-radius: 8px;
            background: rgba(102, 126, 234, 0.4);
            color: white;
            cursor: pointer;
            backdrop-filter: blur(10px);
            transition: all 0.3s;
            pointer-events: auto;
            box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
          " onmouseover="this.style.background='rgba(102, 126, 234, 0.6)'" onmouseout="this.style.background='rgba(102, 126, 234, 0.4)'">
            🔊 启动音频
          </button>
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

function updateEnergy(energy: number) {
  const energyElement = document.getElementById('energyValue');
  if (energyElement) {
    energyElement.textContent = `${(energy * 100).toFixed(1)}%`;
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

  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

  console.log('🔍 isTauri:', isTauri);

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
