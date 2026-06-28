import { listen } from '@tauri-apps/api/event';

const app = document.getElementById('app') as HTMLDivElement;

function updateUI(energy: number) {
    app.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    ">
      <h1 style="font-size: 2rem; margin-bottom: 1rem;">FlowSpace</h1>
      <div style="font-size: 4rem; font-weight: bold;">
        ${(energy * 100).toFixed(1)}%
      </div>
      <div style="font-size: 1.2rem; opacity: 0.8; margin-top: 0.5rem;">
        Flow Energy
      </div>
    </div>
  `;
}

async function main() {
    document.body.style.margin = '0';
    document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

    updateUI(0.0);

    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

    console.log('🔍 isTauri:', isTauri);

    if (isTauri) {
        console.log('✅ 检测到 Tauri 环境，连接 Rust 后端...');
        
        try {
            console.log('📡 正在监听 flow-energy-update 事件...');
            await listen<number>('flow-energy-update', (event) => {
                console.log('📨 收到心流值:', event.payload);
                updateUI(event.payload);
            });
            console.log('✅ 事件监听器已启动！');
        } catch (error) {
            console.error('❌ Tauri 事件监听失败:', error);
        }
    } else {
        console.log('⚠️  检测到浏览器环境，此项目需要 Tauri 桌面环境运行！');
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
        padding: 2rem;
      ">
        <h1 style="font-size: 2rem; margin-bottom: 1rem;">FlowSpace</h1>
        <p style="font-size: 1.2rem; opacity: 0.9;">此项目需要在 Tauri 桌面窗口中运行</p>
        <p style="font-size: 1rem; opacity: 0.7; margin-top: 0.5rem;">请使用 npm run tauri dev 启动</p>
      </div>
    `;
    }
}

main();
