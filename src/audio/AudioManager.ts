import { invoke } from '@tauri-apps/api/core';
import {
  DEFAULT_WEATHER_AUDIO_KIND,
  type WeatherAudioKind,
  WEATHER_AUDIO_RULES,
  WIND_AUDIO_THRESHOLD_MPS,
  resolveWeatherAudioKindFromCode,
  resolveWeatherAudioKindFromText,
} from './weatherAudioConfig';
import {
  LocationPermissionManager,
  type NativeLocationPayload,
  type LocationPermissionState,
} from './LocationPermissionManager';

export type WeatherAmbience = 'rain' | 'wind';
export type AudioSourceType = 'default' | 'weather';

export type AudioConfig = {
  sourceType: AudioSourceType;
  customWeatherParam: string;
};

export type AudioCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type AudioWeatherContext = {
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
  formattedAddress: string;
  resolvedWeatherKind: WeatherAudioKind;
  weatherTrackIds: string[];
  geolocationPermission: PermissionState | 'unsupported';
  permissionState: LocationPermissionState;
  systemLocationEnabled: boolean;
  coordinateAccuracyMeters: number | null;
  errors: string[];
};

type WeatherProviderResponse = {
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

type OpenMeteoResponse = {
  current: {
    temperature_2m: number;
    weather_code: number;
    is_day: number;
    wind_speed_10m: number;
  };
};

type ReverseGeocodeResponse = {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    county?: string;
    country?: string;
  };
};

type LocationResult = {
  coordinates: AudioCoordinates | null;
  permissionState: PermissionState | 'unsupported';
  error: string | null;
};

const GEOLOCATION_TIMEOUT_MS = 3500;
const WEATHER_TIMEOUT_MS = 5000;
const REVERSE_GEOCODE_TIMEOUT_MS = 3500;
const WEATHER_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const WEATHER_REQUEST_TIMEOUT_MESSAGE = '天气接口请求超时。';
const REVERSE_GEOCODE_TIMEOUT_MESSAGE = '地址解析请求超时。';

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private weatherAmbience: WeatherAmbience = 'wind';
  private audioConfig: AudioConfig = {
    sourceType: 'weather',
    customWeatherParam: '',
  };
  private weatherContext: AudioWeatherContext | null = null;
  private lastWeatherSyncAt = 0;
  private permissionManager = LocationPermissionManager.getInstance();

  setWeatherAmbience(ambience: WeatherAmbience) {
    this.weatherAmbience = ambience;
  }

  getWeatherContext(): AudioWeatherContext | null {
    return this.weatherContext;
  }

  /**
   * 获取定位权限管理器的引用，用于 UI 层展示权限状态和引导用户授权。
   */
  getPermissionManager(): LocationPermissionManager {
    return this.permissionManager;
  }

  setAudioConfig(config: AudioConfig) {
    const sourceType: AudioSourceType = config.sourceType === 'default' ? 'default' : 'weather';
    this.audioConfig = {
      sourceType,
      customWeatherParam: config.customWeatherParam.trim(),
    };
  }

  async loadWeatherContext(options: { forceRefresh?: boolean; maxAgeMs?: number } = {}): Promise<AudioWeatherContext | null> {
    const { forceRefresh = false, maxAgeMs = WEATHER_CACHE_MAX_AGE_MS } = options;
    if (!forceRefresh && this.weatherContext && Date.now() - this.lastWeatherSyncAt < maxAgeMs) {
      return this.weatherContext;
    }

    const locationResult = await this.requestCurrentLocation();
    const errors: string[] = [];
    if (locationResult.error) {
      errors.push(locationResult.error);
    }

    let providerWeather: WeatherProviderResponse | null = null;
    try {
      providerWeather = await this.fetchWeather(locationResult.coordinates);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
    }

    if (!providerWeather) {
      const permissionSnapshot = await this.permissionManager.getPermissionSnapshot(true);
      const fallback = this.buildFallbackWeatherContext(locationResult, errors, permissionSnapshot.state, permissionSnapshot.systemLocationEnabled);
      this.weatherContext = fallback;
      this.weatherAmbience = fallback.ambience;
      this.lastWeatherSyncAt = Date.now();
      return fallback;
    }

    const resolvedWeatherKind = this.resolveWeatherKind(
      providerWeather.weatherCode,
      providerWeather.windSpeedMps,
      this.audioConfig.customWeatherParam,
    );
    const rule = WEATHER_AUDIO_RULES[resolvedWeatherKind];

    const reverseGeocode = locationResult.coordinates
      ? await this.reverseGeocode(locationResult.coordinates).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(message);
          return null;
        })
      : null;

    const permissionSnapshot = await this.permissionManager.getPermissionSnapshot(true);

    const weatherContext: AudioWeatherContext = {
      ...providerWeather,
      city: reverseGeocode?.city || providerWeather.city,
      country: reverseGeocode?.country || providerWeather.country,
      formattedAddress:
        reverseGeocode?.formattedAddress ||
        this.composeAddress(providerWeather.city, providerWeather.country, locationResult.coordinates),
      resolvedWeatherKind,
      weatherTrackIds: [...rule.trackIds],
      geolocationPermission: locationResult.permissionState,
      permissionState: permissionSnapshot.state,
      systemLocationEnabled: permissionSnapshot.systemLocationEnabled,
      coordinateAccuracyMeters: locationResult.coordinates?.accuracy ?? null,
      errors,
    };

    this.weatherContext = weatherContext;
    this.weatherAmbience = rule.ambience;
    this.lastWeatherSyncAt = Date.now();
    return weatherContext;
  }

  getWeatherTrackIds(availableTrackIds?: Iterable<string>): string[] {
    const candidateTrackIds = WEATHER_AUDIO_RULES[this.resolveConfiguredWeatherKind()].trackIds;

    if (!availableTrackIds) {
      return [...candidateTrackIds];
    }

    const allowed = new Set(availableTrackIds);
    return candidateTrackIds.filter((trackId) => allowed.has(trackId));
  }

  getWeatherResourcePaths(): string[] {
    return [...WEATHER_AUDIO_RULES[this.resolveConfiguredWeatherKind()].resourceHints];
  }

  async start() {
    if (this.audioContext) {
      await this.resume();
      return;
    }

    try {
      this.audioContext = new (
        window.AudioContext ||
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      )();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.75;
      this.masterGain.connect(this.audioContext.destination);
    } catch (error) {
      console.error('❌ Audio init error:', error);
    }
  }

  async resume() {
    if (!this.audioContext) {
      await this.start();
      return;
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async pause() {
    if (!this.audioContext) {
      return;
    }

    if (this.audioContext.state === 'running') {
      await this.audioContext.suspend();
    }
  }

  isActive() {
    return this.audioContext?.state === 'running';
  }

  updateEnergy(energy: number) {
    if (!this.masterGain || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    const baseGain = this.getBaseAmbienceGain();
    this.masterGain.gain.setTargetAtTime(baseGain + energy * 0.08, now, 0.1);
  }

  private async requestCurrentLocation(): Promise<LocationResult> {
    const permissionState = await this.queryGeolocationPermission();
    const permissionSnapshot = await this.permissionManager.getPermissionSnapshot();

    if (this.isTauriEnvironment() && permissionSnapshot.platform === 'macos') {
      try {
        const nativeLocation = await this.withTimeout(
          this.permissionManager.requestNativeLocation(),
          GEOLOCATION_TIMEOUT_MS + 8500,
          'macOS 原生定位请求超时，已降级到天气默认策略。',
        );
        await this.permissionManager.refreshAfterNativeLocation(nativeLocation);

        return {
          coordinates: this.normalizeNativeLocation(nativeLocation),
          permissionState,
          error: null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          coordinates: null,
          permissionState,
          error: message || 'macOS 原生定位获取失败，已降级到天气默认策略。',
        };
      }
    }

    if (!('geolocation' in navigator)) {
      return {
        coordinates: null,
        permissionState,
        error: '当前设备不支持定位接口，已降级到天气默认策略。',
      };
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            coordinates: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
            },
            permissionState,
            error: null,
          });
        },
        (error) => {
          const reason =
            error.code === error.PERMISSION_DENIED
              ? '定位权限被拒绝，已降级到天气默认策略。'
              : error.code === error.TIMEOUT
                ? '定位请求超时，已降级到天气默认策略。'
                : '定位获取失败，已降级到天气默认策略。';
          resolve({
            coordinates: null,
            permissionState,
            error: reason,
          });
        },
        {
          enableHighAccuracy: false,
          timeout: GEOLOCATION_TIMEOUT_MS,
          maximumAge: 30 * 60 * 1000,
        },
      );
    });
  }

  private async queryGeolocationPermission(): Promise<PermissionState | 'unsupported'> {
    if (!('permissions' in navigator) || !navigator.permissions?.query) {
      return 'unsupported';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return result.state;
    } catch {
      return 'unsupported';
    }
  }

  private async fetchWeather(coordinates: AudioCoordinates | null): Promise<WeatherProviderResponse> {
    if (this.isTauriEnvironment()) {
      try {
        const payload = await this.withTimeout(
          invoke<unknown>('fetch_startup_weather', coordinates ?? {}),
          WEATHER_TIMEOUT_MS,
          WEATHER_REQUEST_TIMEOUT_MESSAGE,
        );
        return this.normalizeWeatherProviderResponse(payload);
      } catch (error) {
        console.error('❌ 通过 Tauri 命令获取天气失败，尝试直连 Open-Meteo:', error);
      }
    }

    if (!coordinates) {
      throw new Error('缺少定位坐标，无法请求第三方天气接口。');
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', String(coordinates.latitude));
      url.searchParams.set('longitude', String(coordinates.longitude));
      url.searchParams.set('current', 'temperature_2m,weather_code,is_day,wind_speed_10m');
      url.searchParams.set('timezone', 'auto');

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`天气接口返回异常: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as OpenMeteoResponse;
      if (!payload.current || typeof payload.current.weather_code !== 'number') {
        throw new Error('天气数据解析失败: 返回内容不完整。');
      }

      return this.normalizeWeatherProviderResponse({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        city: 'Current Location',
        country: 'Device Geolocation',
        temperatureC: payload.current.temperature_2m,
        weatherCode: payload.current.weather_code,
        isDay: payload.current.is_day === 1,
        windSpeedMps: payload.current.wind_speed_10m,
        ambience: this.resolveAmbienceFromCode(payload.current.weather_code, payload.current.wind_speed_10m),
        source: 'open-meteo-direct',
        locationSource: 'device-geolocation',
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(WEATHER_REQUEST_TIMEOUT_MESSAGE);
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async reverseGeocode(
    coordinates: AudioCoordinates,
  ): Promise<{ formattedAddress: string; city: string; country: string } | null> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT_MS);

    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(coordinates.latitude));
      url.searchParams.set('lon', String(coordinates.longitude));
      url.searchParams.set('zoom', '10');
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`地址解析失败: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ReverseGeocodeResponse;
      if (!payload || typeof payload !== 'object') {
        throw new Error('地址解析失败: 返回内容格式非法。');
      }
      const city =
        payload.address?.city ||
        payload.address?.town ||
        payload.address?.village ||
        payload.address?.county ||
        'Current Location';
      const country = payload.address?.country || 'Unknown';

      return {
        formattedAddress:
          payload.display_name || this.composeAddress(city, country, coordinates),
        city,
        country,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(REVERSE_GEOCODE_TIMEOUT_MESSAGE);
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildFallbackWeatherContext(
    locationResult: LocationResult,
    errors: string[],
    permissionState: LocationPermissionState,
    systemLocationEnabled: boolean,
  ): AudioWeatherContext {
    const resolvedWeatherKind =
      resolveWeatherAudioKindFromText(this.audioConfig.customWeatherParam) ||
      (this.weatherAmbience === 'rain' ? 'rain' : DEFAULT_WEATHER_AUDIO_KIND);
    const rule = WEATHER_AUDIO_RULES[resolvedWeatherKind];
    const coordinates = locationResult.coordinates;

    return {
      latitude: coordinates?.latitude ?? 0,
      longitude: coordinates?.longitude ?? 0,
      city: 'Current Location',
      country: 'Unknown',
      temperatureC: 0,
      weatherCode: -1,
      isDay: true,
      windSpeedMps: 0,
      ambience: rule.ambience,
      source: 'fallback',
      locationSource: coordinates ? 'device-geolocation' : 'fallback',
      formattedAddress: this.composeAddress('Current Location', 'Unknown', coordinates),
      resolvedWeatherKind,
      weatherTrackIds: [...rule.trackIds],
      geolocationPermission: locationResult.permissionState,
      permissionState,
      systemLocationEnabled,
      coordinateAccuracyMeters: coordinates?.accuracy ?? null,
      errors,
    };
  }

  private resolveWeatherKind(
    weatherCode: number,
    windSpeedMps: number,
    customWeatherParam: string,
  ): WeatherAudioKind {
    const fromCustomInput = resolveWeatherAudioKindFromText(customWeatherParam);
    if (fromCustomInput) {
      return fromCustomInput;
    }

    const fromWeatherCode = resolveWeatherAudioKindFromCode(weatherCode);
    if (fromWeatherCode) {
      return fromWeatherCode;
    }

    if (windSpeedMps >= WIND_AUDIO_THRESHOLD_MPS) {
      return 'wind';
    }

    return DEFAULT_WEATHER_AUDIO_KIND;
  }

  private resolveConfiguredWeatherKind(): WeatherAudioKind {
    if (this.audioConfig.sourceType === 'default') {
      return DEFAULT_WEATHER_AUDIO_KIND;
    }

    return (
      resolveWeatherAudioKindFromText(this.audioConfig.customWeatherParam) ||
      this.weatherContext?.resolvedWeatherKind ||
      (this.weatherAmbience === 'rain' ? 'rain' : DEFAULT_WEATHER_AUDIO_KIND)
    );
  }

  private resolveAmbienceFromCode(weatherCode: number, windSpeedMps: number): WeatherAmbience {
    const kind = this.resolveWeatherKind(weatherCode, windSpeedMps, '');
    return WEATHER_AUDIO_RULES[kind].ambience;
  }

  private normalizeWeatherProviderResponse(payload: unknown): WeatherProviderResponse {
    if (!payload || typeof payload !== 'object') {
      throw new Error('天气数据解析失败: 返回内容格式非法。');
    }

    const data = payload as Partial<WeatherProviderResponse>;
    const weatherCode = this.requireFiniteNumber(data.weatherCode, 'weatherCode');
    const windSpeedMps = this.requireFiniteNumber(data.windSpeedMps, 'windSpeedMps');

    return {
      latitude: this.requireFiniteNumber(data.latitude, 'latitude'),
      longitude: this.requireFiniteNumber(data.longitude, 'longitude'),
      city: this.requireString(data.city, 'city', 'Current Location'),
      country: this.requireString(data.country, 'country', 'Unknown'),
      temperatureC: this.requireFiniteNumber(data.temperatureC, 'temperatureC'),
      weatherCode,
      isDay: typeof data.isDay === 'boolean' ? data.isDay : true,
      windSpeedMps,
      ambience: this.normalizeAmbience(data.ambience, weatherCode, windSpeedMps),
      source: this.requireString(data.source, 'source', 'unknown'),
      locationSource: this.requireString(data.locationSource, 'locationSource', 'unknown'),
    };
  }

  private requireFiniteNumber(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`天气数据解析失败: ${fieldName} 字段非法。`);
    }
    return value;
  }

  private requireString(value: unknown, fieldName: string, fallback: string): string {
    if (typeof value !== 'string') {
      return fallback;
    }

    const normalized = value.trim();
    if (!normalized) {
      if (fallback) {
        return fallback;
      }
      throw new Error(`天气数据解析失败: ${fieldName} 字段为空。`);
    }
    return normalized;
  }

  private normalizeAmbience(value: unknown, weatherCode: number, windSpeedMps: number): WeatherAmbience {
    return value === 'rain' || value === 'wind'
      ? value
      : this.resolveAmbienceFromCode(weatherCode, windSpeedMps);
  }

  private normalizeNativeLocation(payload: NativeLocationPayload): AudioCoordinates {
    if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
      throw new Error('macOS 原生定位返回的经纬度非法。');
    }

    return {
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: typeof payload.accuracy === 'number' && Number.isFinite(payload.accuracy)
        ? payload.accuracy
        : null,
    };
  }

  private composeAddress(city: string, country: string, coordinates: AudioCoordinates | null): string {
    const base = [city, country].filter(Boolean).join(', ');
    if (!coordinates) {
      return base || 'Unknown';
    }
    const coordText = `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`;
    return base ? `${base} (${coordText})` : coordText;
  }

  private isTauriEnvironment(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  private getBaseAmbienceGain(): number {
    switch (this.weatherAmbience) {
      case 'rain':
        return 0.52;
      case 'wind':
      default:
        return 0.48;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timeoutId: number | null = null;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }
}
