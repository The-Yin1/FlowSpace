import { listen } from '@tauri-apps/api/event';
import { AudioManager } from './audio/AudioManager';

const audioManager = new AudioManager();
let audioStarted = false;

function createUI() {
    const app = document.getElementById('app') as HTMLDivElement;
    app.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          text-align: center;
        ">
            <h1 style="font-size: 2rem; margin-bottom: 1rem;">FlowSpace</h1>
            <div id="energyValue" style="font-size: 4rem; font-weight: bold;">
                0.0%
            </div>
            <div style="font-size: 1.2rem; opacity: 0.8; margin-top: 0.5rem;">
                Flow Energy
            </div>
            <button id="startAudioBtn" style="
                margin-top: 2rem;
                padding: 1rem 2rem;
                font-size: 1.2rem;
                border: none;
                border-radius: 8px;
                background: rgba(255,255,255,0.2);
                color: white;
                cursor: pointer;
                backdrop-filter: blur(10px);
                transition: all 0.3s;
            ">
                🔊 启动音频
            </button>
        </div>
    `;

    const btn = document.getElementById('startAudioBtn');
    if (btn) {
        btn.addEventListener('click', async () => {
            console.log('🎵 Clicked start audio');
            await audioManager.start();
            audioStarted = true;
            btn.style.display = 'none';
        });
    }
}

function updateEnergy(energy: number) {
    const energyElement = document.getElementById('energyValue');
    if (energyElement) {
        energyElement.textContent = `${(energy * 100).toFixed(1)}%`;
    }
    audioManager.updateEnergy(energy);
}

async function main() {
    document.body.style.margin = '0';
    document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

    createUI();

    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

    console.log('🔍 isTauri:', isTauri);

    if (isTauri) {
        console.log('✅ 检测到 Tauri 环境，连接 Rust 后端...');
        
        try {
            console.log('📡 正在监听 flow-energy-update 事件...');
            await listen<number>('flow-energy-update', (event) => {
                console.log('📨 收到心流值:', event.payload);
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
