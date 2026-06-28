use tauri::{Manager, Emitter, command};
use std::time::{Duration, Instant};
use std::thread::sleep;
use device_query::{DeviceQuery, DeviceState, Keycode};
use std::sync::Arc;
use parking_lot::Mutex;
use std::panic;

const MAX_WPM: f64 = 120.0;
const WINDOW_SECONDS: u64 = 5;
const TICK_MS: u64 = 100;
const DECAY_FACTOR: f64 = 0.95;

struct FlowState {
    recent_timestamps: Vec<Instant>,
    current_energy: f64,
    last_energy: f64,
    last_keys: Vec<Keycode>,
}

impl FlowState {
    fn new() -> Self {
        Self {
            recent_timestamps: Vec::new(),
            current_energy: 0.0,
            last_energy: 0.0,
            last_keys: Vec::new(),
        }
    }

    fn record_stroke(&mut self) {
        self.recent_timestamps.push(Instant::now());
    }

    fn tick(&mut self) -> f64 {
        let cutoff = Instant::now() - Duration::from_secs(WINDOW_SECONDS);
        self.recent_timestamps.retain(|&t| t > cutoff);
        
        let stroke_count = self.recent_timestamps.len() as f64;
        let wpm = (stroke_count / 5.0) * (60.0 / WINDOW_SECONDS as f64);
        let raw_energy = (wpm / MAX_WPM).min(1.0);
        
        self.current_energy = self.current_energy.max(raw_energy);
        let energy = self.current_energy;
        
        self.current_energy *= DECAY_FACTOR;
        self.current_energy = self.current_energy.clamp(0.0, 1.0);
        
        energy
    }
}

#[command]
fn record_key_stroke(state: tauri::State<Arc<Mutex<FlowState>>>) {
    state.lock().record_stroke();
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.app_handle().clone();
            
            println!("🚀 FlowSpace 正在启动...");
            
            let flow_state = Arc::new(Mutex::new(FlowState::new()));
            app.manage(Arc::clone(&flow_state));
            
            let flow_state_timer = Arc::clone(&flow_state);
            let flow_state_listener = Arc::clone(&flow_state);

            std::thread::spawn(move || {
                println!("🎯 正在启动全局键盘监听...");
                
                let result = panic::catch_unwind(panic::AssertUnwindSafe(move || {
                    let device_state = DeviceState::new();
                    
                    loop {
                        sleep(Duration::from_millis(20));
                        
                        let keys: Vec<Keycode> = device_state.get_keys();
                        
                        let mut state = flow_state_listener.lock();
                        
                        if !keys.is_empty() {
                            let new_keys: Vec<_> = keys.iter().filter(|k| !state.last_keys.contains(k)).cloned().collect();
                            
                            if !new_keys.is_empty() {
                                state.record_stroke();
                            }
                        }
                        
                        state.last_keys = keys;
                    }
                }));
                
                if let Err(e) = result {
                    println!("⚠️ 全局键盘监听失败（这可能是由于 macOS 权限问题），错误: {:?}", e);
                    println!("💡 程序将继续运行在窗口监听模式！");
                }
            });

            std::thread::spawn(move || {
                println!("📡 开始发送心流数据到前端...");
                
                loop {
                    sleep(Duration::from_millis(TICK_MS));
                    
                    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
                        let mut state = flow_state_timer.lock();
                        let energy = state.tick();
                        
                        let has_changed = (energy - state.last_energy).abs() > 0.001 || energy > 0.0;
                        state.last_energy = energy;
                        
                        if has_changed {
                            println!("📤 当前心流值: {:.3}", energy);
                        }
                        
                        match app_handle.emit("flow-energy-update", energy) {
                            Ok(_) => {}
                            Err(e) => {
                                if has_changed {
                                    println!("⚠️  发送事件失败: {:?}", e);
                                }
                            }
                        }
                    }));
                    
                    if let Err(e) = result {
                        println!("⚠️  发送数据时发生错误: {:?}", e);
                    }
                }
            });
            
            println!("✅ FlowSpace 启动完成！");
            
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![record_key_stroke])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
