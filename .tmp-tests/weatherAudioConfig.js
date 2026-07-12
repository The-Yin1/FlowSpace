export const DEFAULT_WEATHER_AUDIO_KIND = 'wind';
export const WIND_AUDIO_THRESHOLD_MPS = 8;
export const WEATHER_AUDIO_RULES = {
    clear: {
        label: '晴朗',
        ambience: 'wind',
        openMeteoCodes: [0, 1],
        keywords: ['晴', 'clear', 'sunny'],
        trackIds: [],
        resourceHints: [],
    },
    cloudy: {
        label: '多云',
        ambience: 'wind',
        openMeteoCodes: [2, 3],
        keywords: ['云', 'cloud', 'overcast'],
        trackIds: [],
        resourceHints: [],
    },
    fog: {
        label: '雾天',
        ambience: 'wind',
        openMeteoCodes: [45, 48],
        keywords: ['雾', 'fog', 'mist', 'haze'],
        trackIds: [],
        resourceHints: [],
    },
    wind: {
        label: '风天',
        ambience: 'wind',
        openMeteoCodes: [],
        keywords: ['风', 'wind', 'breeze', 'gust'],
        trackIds: ['wind', 'forest_wind', 'howling_wind'],
        resourceHints: ['/nature/wind.mp3', '/nature/wind-in-trees.mp3', '/nature/howling-wind.mp3'],
    },
    rain: {
        label: '雨天',
        ambience: 'rain',
        openMeteoCodes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82],
        keywords: ['雨', 'rain', 'drizzle', 'shower'],
        trackIds: ['water_drop'],
        resourceHints: ['/nature/droplets.mp3'],
    },
    snow: {
        label: '雪天',
        ambience: 'wind',
        openMeteoCodes: [71, 73, 75, 77, 85, 86],
        keywords: ['雪', 'snow', 'sleet', 'blizzard'],
        trackIds: ['snow_walk'],
        resourceHints: ['/nature/walk-in-snow.mp3'],
    },
    storm: {
        label: '暴风雨',
        ambience: 'rain',
        openMeteoCodes: [95, 96, 99],
        keywords: ['雷', '暴', 'storm', 'thunder', 'thunderstorm'],
        trackIds: ['water_drop', 'howling_wind'],
        resourceHints: ['/nature/droplets.mp3', '/nature/howling-wind.mp3'],
    },
};
export function validateWeatherAudioRules(rules) {
    const seenCodes = new Map();
    for (const [kind, rule] of Object.entries(rules)) {
        if (!rule.label.trim()) {
            throw new Error(`weatherAudioConfig: ${kind} 缺少 label`);
        }
        if (!Array.isArray(rule.trackIds) || !Array.isArray(rule.resourceHints) || !Array.isArray(rule.keywords)) {
            throw new Error(`weatherAudioConfig: ${kind} 的配置格式非法`);
        }
        for (const trackId of rule.trackIds) {
            if (!trackId.trim()) {
                throw new Error(`weatherAudioConfig: ${kind} 存在空 trackId`);
            }
        }
        for (const resourcePath of rule.resourceHints) {
            if (!resourcePath.startsWith('/nature/')) {
                throw new Error(`weatherAudioConfig: ${kind} 的资源路径必须位于 /nature 下，收到 ${resourcePath}`);
            }
        }
        for (const code of rule.openMeteoCodes) {
            const previous = seenCodes.get(code);
            if (previous) {
                throw new Error(`weatherAudioConfig: weather code ${code} 在 ${previous} 与 ${kind} 间重复配置`);
            }
            seenCodes.set(code, kind);
        }
    }
}
export function resolveWeatherAudioKindFromCode(weatherCode) {
    for (const [kind, rule] of Object.entries(WEATHER_AUDIO_RULES)) {
        if (rule.openMeteoCodes.includes(weatherCode)) {
            return kind;
        }
    }
    return null;
}
export function resolveWeatherAudioKindFromText(value) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    for (const [kind, rule] of Object.entries(WEATHER_AUDIO_RULES)) {
        if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
            return kind;
        }
    }
    return null;
}
validateWeatherAudioRules(WEATHER_AUDIO_RULES);
