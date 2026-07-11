use serde::{Deserialize, Serialize};
use tauri::{command, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
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
const DEFAULT_WINDOW_WIDTH: f64 = 1100.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 680.0;
const DEFAULT_MIN_WIDTH: f64 = 960.0;
const DEFAULT_MIN_HEIGHT: f64 = 600.0;
const MINI_WINDOW_WIDTH: f64 = 180.0;
const MINI_WINDOW_HEIGHT: f64 = 50.0;

#[derive(Debug, Deserialize)]
struct OpenMeteoResponse {
    current: OpenMeteoCurrent,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoCurrent {
    temperature_2m: f64,
    weather_code: i32,
    is_day: i32,
    wind_speed_10m: f64,
}

#[derive(Debug, Deserialize)]
struct IpApiResponse {
    city: Option<String>,
    country_name: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupWeather {
    latitude: f64,
    longitude: f64,
    city: String,
    country: String,
    temperature_c: f64,
    weather_code: i32,
    is_day: bool,
    wind_speed_mps: f64,
    ambience: String,
    source: String,
    location_source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PermissionStatus {
    platform: String,
    accessibility_granted: bool,
    input_monitoring_granted: bool,
    input_monitoring_status: String,
    should_show_guidance: bool,
    accessibility_prompted: bool,
    message: String,
}

struct FlowState {
    recent_timestamps: Vec<Instant>,
    current_energy: f64,
    last_energy: f64,
    last_keys: Vec<Keycode>,
}

#[derive(Clone, Copy, Debug)]
struct WindowSnapshot {
    position: Option<PhysicalPosition<i32>>,
    size: PhysicalSize<u32>,
}

struct WindowRestoreState {
    standard_snapshot: Mutex<Option<WindowSnapshot>>,
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

fn map_weather_code_to_ambience(weather_code: i32) -> &'static str {
    match weather_code {
        51 | 53 | 55 | 56 | 57 | 61 | 63 | 65 | 66 | 67 | 80 | 81 | 82 | 95 | 96 | 99 => "rain",
        _ => "wind",
    }
}

fn ensure_keyboard_listener_running(
    flow_state_listener: Arc<Mutex<FlowState>>,
    listener_started: Arc<AtomicBool>,
) {
    if listener_started.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        println!("🎯 正在启动全局键盘监听...");

        let result = panic::catch_unwind(panic::AssertUnwindSafe(move || {
            let device_state = DeviceState::new();

            loop {
                sleep(Duration::from_millis(20));

                let keys: Vec<Keycode> = device_state.get_keys();

                let mut state = flow_state_listener.lock();

                if !keys.is_empty() {
                    let new_keys: Vec<_> = keys
                        .iter()
                        .filter(|k| !state.last_keys.contains(k))
                        .cloned()
                        .collect();

                    if !new_keys.is_empty() {
                        state.record_stroke();
                    }
                }

                state.last_keys = keys;
            }
        }));

        if let Err(e) = result {
            listener_started.store(false, Ordering::SeqCst);
            println!("⚠️ 全局键盘监听失败（这可能是由于 macOS 权限问题），错误: {:?}", e);
            println!("💡 请确认已同时开启“辅助功能”和“输入监控”，然后重新启动 FlowSpace。");
        }
    });
}

#[cfg(target_os = "macos")]
mod macos_permissions {
    use super::PermissionStatus;
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::{CFString, CFStringRef};
    use std::ffi::c_void;

    type CFDictionaryRef = *const c_void;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
        static kAXTrustedCheckOptionPrompt: CFStringRef;
    }

    fn accessibility_trusted_with_prompt(prompt: bool) -> bool {
        if !prompt {
            return unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) };
        }

        let prompt_key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
        let prompt_value = CFBoolean::true_value();
        let options = CFDictionary::from_CFType_pairs(&[(prompt_key.as_CFType(), prompt_value.as_CFType())]);

        unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef() as CFDictionaryRef) }
    }

    fn is_accessibility_granted() -> bool {
        accessibility_trusted_with_prompt(false)
    }

    fn prompt_for_accessibility_if_needed() -> bool {
        if is_accessibility_granted() {
            return false;
        }

        let _ = accessibility_trusted_with_prompt(true);

        true
    }

    fn is_input_monitoring_granted() -> bool {
        unsafe { CGPreflightListenEventAccess() }
    }

    fn request_input_monitoring_if_needed() -> bool {
        if is_input_monitoring_granted() {
            return false;
        }

        let _ = unsafe { CGRequestListenEventAccess() };
        true
    }

    pub fn get_permission_status(prompt_if_needed: bool) -> PermissionStatus {
        let accessibility_granted = is_accessibility_granted();
        let mut input_monitoring_granted = is_input_monitoring_granted();
        let accessibility_prompted = if prompt_if_needed && !accessibility_granted {
            prompt_for_accessibility_if_needed()
        } else {
            false
        };

        if prompt_if_needed && accessibility_granted && !input_monitoring_granted {
            let _ = request_input_monitoring_if_needed();
            input_monitoring_granted = is_input_monitoring_granted();
        }

        let message = if accessibility_granted && input_monitoring_granted {
            "已检测到“辅助功能”和“输入监控”权限，键盘监听环境已就绪。".to_string()
        } else if !accessibility_granted && !input_monitoring_granted {
            "尚未授予“辅助功能”和“输入监控”权限。请在系统设置中同时开启这两个权限，否则无法稳定统计全局键盘输入。".to_string()
        } else if !accessibility_granted {
            "尚未授予“辅助功能”权限。请在系统设置中开启“辅助功能”，否则无法稳定统计全局键盘输入。".to_string()
        } else if !input_monitoring_granted {
            "已检测到“辅助功能”权限，但“输入监控”尚未开启。请在系统设置中为 FlowSpace 打开“输入监控”。".to_string()
        } else if accessibility_prompted {
            "尚未授予“辅助功能”权限，系统已尝试弹出授权提示。请同时在“辅助功能”和“输入监控”中为 FlowSpace 打开开关，然后重启应用。".to_string()
        } else {
            "尚未授予“辅助功能”权限。请在系统设置中同时开启“辅助功能”和“输入监控”，否则无法稳定统计全局键盘输入。".to_string()
        };

        PermissionStatus {
            platform: "macos".to_string(),
            accessibility_granted,
            input_monitoring_granted,
            input_monitoring_status: if input_monitoring_granted {
                "granted".to_string()
            } else {
                "missing".to_string()
            },
            should_show_guidance: !(accessibility_granted && input_monitoring_granted),
            accessibility_prompted,
            message,
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn get_permission_status_internal(_prompt_if_needed: bool) -> PermissionStatus {
    PermissionStatus {
        platform: std::env::consts::OS.to_string(),
        accessibility_granted: true,
        input_monitoring_granted: true,
        input_monitoring_status: "not-required".to_string(),
        should_show_guidance: false,
        accessibility_prompted: false,
        message: "当前平台无需额外的 macOS 隐私权限提示。".to_string(),
    }
}

#[cfg(target_os = "macos")]
fn get_permission_status_internal(prompt_if_needed: bool) -> PermissionStatus {
    macos_permissions::get_permission_status(prompt_if_needed)
}

#[command]
fn record_key_stroke(state: tauri::State<Arc<Mutex<FlowState>>>) {
    state.lock().record_stroke();
}

#[command]
fn get_permission_status(
    flow_state: tauri::State<Arc<Mutex<FlowState>>>,
    listener_started: tauri::State<Arc<AtomicBool>>,
) -> PermissionStatus {
    let status = get_permission_status_internal(false);
    if status.accessibility_granted {
        ensure_keyboard_listener_running(
            Arc::clone(flow_state.inner()),
            Arc::clone(listener_started.inner()),
        );
    }

    status
}

#[command]
fn request_accessibility_permission(
    flow_state: tauri::State<Arc<Mutex<FlowState>>>,
    listener_started: tauri::State<Arc<AtomicBool>>,
) -> PermissionStatus {
    let status = get_permission_status_internal(true);
    if status.accessibility_granted {
        ensure_keyboard_listener_running(
            Arc::clone(flow_state.inner()),
            Arc::clone(listener_started.inner()),
        );
    }

    status
}

#[command]
fn open_privacy_settings(target: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let url = match target.as_str() {
            "accessibility" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            "input-monitoring" => "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
            _ => return Err(format!("不支持的权限设置目标: {target}")),
        };

        let status = Command::new("open")
            .arg(url)
            .status()
            .map_err(|err| format!("打开系统设置失败: {err}"))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("系统设置命令退出异常: {status}"))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = target;
        Err("当前平台不支持打开 macOS 隐私设置。".to_string())
    }
}

#[command]
async fn fetch_startup_weather(
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<StartupWeather, String> {
    let (latitude, longitude, city, country, location_source) = match (latitude, longitude) {
        (Some(latitude), Some(longitude)) => (
            latitude,
            longitude,
            "Current Location".to_string(),
            "Device Geolocation".to_string(),
            "device-geolocation".to_string(),
        ),
        _ => resolve_location_from_ip().await?,
    };

    let client = reqwest::Client::new();
    let response = client
        .get("https://api.open-meteo.com/v1/forecast")
        .query(&[
            ("latitude", latitude.to_string()),
            ("longitude", longitude.to_string()),
            (
                "current",
                "temperature_2m,weather_code,is_day,wind_speed_10m".to_string(),
            ),
            ("timezone", "auto".to_string()),
        ])
        .send()
        .await
        .map_err(|err| format!("天气请求失败: {err}"))?
        .error_for_status()
        .map_err(|err| format!("天气接口返回异常: {err}"))?;

    let weather = response
        .json::<OpenMeteoResponse>()
        .await
        .map_err(|err| format!("天气数据解析失败: {err}"))?;

    let ambience = map_weather_code_to_ambience(weather.current.weather_code).to_string();

    println!(
        "🌦️ 启动天气获取成功: city={} country={} code={} temp={:.1}C ambience={}",
        city,
        country,
        weather.current.weather_code,
        weather.current.temperature_2m,
        ambience
    );

    Ok(StartupWeather {
        latitude,
        longitude,
        city,
        country,
        temperature_c: weather.current.temperature_2m,
        weather_code: weather.current.weather_code,
        is_day: weather.current.is_day == 1,
        wind_speed_mps: weather.current.wind_speed_10m,
        ambience,
        source: "open-meteo".to_string(),
        location_source,
    })
}

async fn resolve_location_from_ip() -> Result<(f64, f64, String, String, String), String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://ipapi.co/json/")
        .send()
        .await
        .map_err(|err| format!("IP 定位请求失败: {err}"))?
        .error_for_status()
        .map_err(|err| format!("IP 定位接口返回异常: {err}"))?;

    let location = response
        .json::<IpApiResponse>()
        .await
        .map_err(|err| format!("IP 定位数据解析失败: {err}"))?;

    let latitude = location
        .latitude
        .ok_or_else(|| "IP 定位缺少 latitude".to_string())?;
    let longitude = location
        .longitude
        .ok_or_else(|| "IP 定位缺少 longitude".to_string())?;
    let city = location.city.unwrap_or_else(|| "Unknown City".to_string());
    let country = location
        .country_name
        .unwrap_or_else(|| "Unknown Country".to_string());

    println!(
        "📍 已通过 IP 自动定位城市: {} / {} ({:.4}, {:.4})",
        city, country, latitude, longitude
    );

    Ok((
        latitude,
        longitude,
        city,
        country,
        "ip-geolocation".to_string(),
    ))
}

#[command]
fn set_mini_mode(
    window: tauri::Window,
    is_mini: bool,
    restore_state: State<'_, WindowRestoreState>,
) -> Result<(), String> {
    if is_mini {
        let snapshot = WindowSnapshot {
            position: window.outer_position().ok(),
            size: window
                .inner_size()
                .map_err(|e| format!("Failed to read window size: {e}"))?,
        };
        *restore_state.standard_snapshot.lock() = Some(snapshot);

        let _ = window.set_ignore_cursor_events(false);
        let _ = window.set_always_on_top(true);
        let _ = window.set_resizable(false);
        let _ = window.set_decorations(false);
        let _ = window.set_min_size::<LogicalSize<f64>>(None);
        window
            .set_size(LogicalSize::new(MINI_WINDOW_WIDTH, MINI_WINDOW_HEIGHT))
            .map_err(|e| format!("Failed to set mini size: {e}"))?;
    } else {
        let snapshot = restore_state.standard_snapshot.lock().take();

        window
            .set_decorations(true)
            .map_err(|e| format!("Failed to restore decorations: {e}"))?;
        window
            .set_resizable(true)
            .map_err(|e| format!("Failed to restore resizable: {e}"))?;
        let _ = window.set_maximizable(true);
        let _ = window.set_minimizable(true);
        let _ = window.set_closable(true);
        let _ = window.set_fullscreen(false);
        let _ = window.set_always_on_top(false);
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.set_min_size(Some(LogicalSize::new(
            DEFAULT_MIN_WIDTH,
            DEFAULT_MIN_HEIGHT,
        )));

        match snapshot {
            Some(snapshot) => {
                window
                    .set_size(snapshot.size)
                    .map_err(|e| format!("Failed to restore saved size: {e}"))?;
                if let Some(position) = snapshot.position {
                    window
                        .set_position(position)
                        .map_err(|e| format!("Failed to restore saved position: {e}"))?;
                } else {
                    window
                        .set_size(LogicalSize::new(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT))
                        .map_err(|e| format!("Failed to restore default size: {e}"))?;
                    let _ = window.center();
                }
            }
            None => {
                window
                    .set_size(LogicalSize::new(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT))
                    .map_err(|e| format!("Failed to restore default size: {e}"))?;
                let _ = window.center();
            }
        }

        let _ = window.show();
        let _ = window.set_focus();
    }

    Ok(())
}

#[command]
fn set_window_click_through(window: tauri::Window, ignore: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| format!("Failed to set ignore cursor events: {e}"))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.app_handle().clone();
            let ghost_handle = app_handle.clone();
            
            println!("🚀 FlowSpace 正在启动...");
            
            let flow_state = Arc::new(Mutex::new(FlowState::new()));
            let listener_started = Arc::new(AtomicBool::new(false));
            let restore_state = WindowRestoreState {
                standard_snapshot: Mutex::new(None),
            };
            app.manage(Arc::clone(&flow_state));
            app.manage(Arc::clone(&listener_started));
            app.manage(restore_state);
            
            let flow_state_timer = Arc::clone(&flow_state);
            let flow_state_listener = Arc::clone(&flow_state);
            let permission_status = get_permission_status_internal(false);

            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_decorations(true);
                let _ = main_window.set_resizable(true);
                let _ = main_window.set_maximizable(true);
                let _ = main_window.set_minimizable(true);
                let _ = main_window.set_closable(true);
                let _ = main_window.set_fullscreen(false);
                let _ = main_window.set_always_on_top(false);
                let _ = main_window.set_min_size(Some(LogicalSize::new(
                    DEFAULT_MIN_WIDTH,
                    DEFAULT_MIN_HEIGHT,
                )));
            }

            if permission_status.should_show_guidance {
                println!("🔐 macOS 权限状态: {}", permission_status.message);
            }

            if permission_status.accessibility_granted {
                ensure_keyboard_listener_running(flow_state_listener, Arc::clone(&listener_started));
            } else {
                println!("⏸️ 当前未获得完整的 macOS 键盘监听权限，启动阶段不会主动弹窗；请在前端权限引导条中手动授权。");
            }

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

            // 注册全局快捷键 Option(Alt)+G，用于退出 Ghost 穿透模式
            app.global_shortcut()
                .on_shortcut("Alt+G", move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = ghost_handle.emit("ghost-mode-exit", ());
                    }
                })
                .expect("Failed to register global shortcut Alt+G");

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            record_key_stroke,
            fetch_startup_weather,
            get_permission_status,
            request_accessibility_permission,
            open_privacy_settings,
            set_mini_mode,
            set_window_click_through
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
