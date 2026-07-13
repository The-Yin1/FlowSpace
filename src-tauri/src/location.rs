use serde::Deserialize;

// ---------------------------------------------------------------------------
// 定位坐标解析结果
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ResolvedLocation {
    pub latitude: f64,
    pub longitude: f64,
    pub city: String,
    pub country: String,
    pub location_source: String,
}

// ---------------------------------------------------------------------------
// IP 定位响应类型
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct IpApiResponse {
    city: Option<String>,
    country_name: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
}

// ===========================================================================
// IP 地理定位（ipapi.co）
// ===========================================================================

/// 通过 ipapi.co 进行 IP 地理定位。
/// 要求设置合理的 User-Agent，否则接口会返回 403。
pub async fn resolve_location_from_ip() -> Result<ResolvedLocation, String> {
    let client = reqwest::Client::builder()
        .user_agent("FlowSpace/0.1.0 (macOS; +https://github.com/FlowSpace)")
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

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

    Ok(ResolvedLocation {
        latitude,
        longitude,
        city,
        country,
        location_source: "ip-geolocation".to_string(),
    })
}
