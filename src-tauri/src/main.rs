use serde::{Deserialize, Serialize};
use tauri::{command, Emitter, Manager};
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

fn map_weather_code_to_ambience(weather_code: i32) -> &'static str {
    match weather_code {
        51 | 53 | 55 | 56 | 57 | 61 | 63 | 65 | 66 | 67 | 80 | 81 | 82 | 95 | 96 | 99 => "rain",
        _ => "wind",
    }
}

#[command]
fn record_key_stroke(state: tauri::State<Arc<Mutex<FlowState>>>) {
    state.lock().record_stroke();
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
        .invoke_handler(tauri::generate_handler![
            record_key_stroke,
            fetch_startup_weather
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
