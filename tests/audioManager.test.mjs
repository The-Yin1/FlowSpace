import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { AudioManager } from '../.tmp-tests/AudioManager.js';
import { WEATHER_AUDIO_RULES, validateWeatherAudioRules } from '../.tmp-tests/weatherAudioConfig.js';

const originalFetch = globalThis.fetch;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setGlobalProperty(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function installWindow({ tauri = false } = {}) {
  const windowObject = globalThis;
  if (tauri) {
    windowObject.__TAURI_INTERNALS__ = windowObject.__TAURI_INTERNALS__ ?? {};
  } else {
    delete windowObject.__TAURI_INTERNALS__;
  }
  setGlobalProperty('window', windowObject);
}

function installNavigator({ permission = 'granted', geolocation }) {
  setGlobalProperty('navigator', {
    permissions: {
      query: async () => ({ state: permission }),
    },
    geolocation,
  });
}

function createGeolocationSuccess(coords) {
  return {
    getCurrentPosition(success) {
      success({ coords });
    },
  };
}

function createGeolocationError(code) {
  return {
    getCurrentPosition(_success, error) {
      error({
        code,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    },
  };
}

afterEach(() => {
  if (globalThis.window?.__TAURI_INTERNALS__) {
    clearMocks();
  }
  globalThis.fetch = originalFetch;

  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    delete globalThis.window;
  }

  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }
});

test('天气链路成功时返回定位、地址和匹配音轨', async () => {
  installWindow({ tauri: true });
  installNavigator({
    permission: 'granted',
    geolocation: createGeolocationSuccess({
      latitude: 31.2304,
      longitude: 121.4737,
      accuracy: 18,
    }),
  });

  mockIPC(async (cmd, payload) => {
    assert.equal(cmd, 'fetch_startup_weather');
    assert.equal(payload.latitude, 31.2304);
    assert.equal(payload.longitude, 121.4737);
    return {
      latitude: 31.2304,
      longitude: 121.4737,
      city: 'Current Location',
      country: 'Device Geolocation',
      temperatureC: 28.6,
      weatherCode: 61,
      isDay: true,
      windSpeedMps: 4.2,
      ambience: 'rain',
      source: 'open-meteo',
      locationSource: 'device-geolocation',
    };
  });

  globalThis.fetch = async (input) => {
    assert.match(String(input), /nominatim/);
    return {
      ok: true,
      async json() {
        return {
          display_name: 'Shanghai, China',
          address: {
            city: 'Shanghai',
            country: 'China',
          },
        };
      },
    };
  };

  const manager = new AudioManager();
  const context = await manager.loadWeatherContext({ forceRefresh: true });

  assert.equal(context.city, 'Shanghai');
  assert.equal(context.country, 'China');
  assert.equal(context.formattedAddress, 'Shanghai, China');
  assert.equal(context.source, 'open-meteo');
  assert.equal(context.resolvedWeatherKind, 'rain');
  assert.deepEqual(context.weatherTrackIds, ['water_drop']);
  assert.equal(context.geolocationPermission, 'granted');
});

test('定位被拒绝且无法请求天气时会降级到默认白噪音策略', async () => {
  installWindow({ tauri: false });
  installNavigator({
    permission: 'denied',
    geolocation: createGeolocationError(1),
  });

  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('should not fetch weather without coordinates');
  };

  const manager = new AudioManager();
  const context = await manager.loadWeatherContext({ forceRefresh: true });

  assert.equal(fetchCalls, 0);
  assert.equal(context.source, 'fallback');
  assert.equal(context.locationSource, 'fallback');
  assert.equal(context.resolvedWeatherKind, 'wind');
  assert.deepEqual(context.weatherTrackIds, ['wind', 'forest_wind', 'howling_wind']);
  assert.match(context.errors.join(' | '), /定位权限被拒绝/);
  assert.match(context.errors.join(' | '), /缺少定位坐标/);
});

test('天气接口超时时会保留定位结果并优雅降级', async () => {
  installWindow({ tauri: false });
  installNavigator({
    permission: 'granted',
    geolocation: createGeolocationSuccess({
      latitude: 35.6762,
      longitude: 139.6503,
      accuracy: 22,
    }),
  });

  globalThis.fetch = async (input) => {
    assert.match(String(input), /open-meteo/);
    throw new DOMException('The operation was aborted.', 'AbortError');
  };

  const manager = new AudioManager();
  const context = await manager.loadWeatherContext({ forceRefresh: true });

  assert.equal(context.source, 'fallback');
  assert.equal(context.locationSource, 'device-geolocation');
  assert.equal(context.coordinateAccuracyMeters, 22);
  assert.match(context.errors.join(' | '), /天气接口请求超时/);
});

test('地址反解失败不会阻断天气白噪音匹配', async () => {
  installWindow({ tauri: true });
  installNavigator({
    permission: 'granted',
    geolocation: createGeolocationSuccess({
      latitude: 47.6062,
      longitude: -122.3321,
      accuracy: 9,
    }),
  });

  mockIPC(async () => ({
    latitude: 47.6062,
    longitude: -122.3321,
    city: 'Current Location',
    country: 'Device Geolocation',
    temperatureC: 8,
    weatherCode: 95,
    isDay: false,
    windSpeedMps: 11,
    ambience: 'rain',
    source: 'open-meteo',
    locationSource: 'device-geolocation',
  }));

  globalThis.fetch = async () => {
    throw new Error('reverse geocode unavailable');
  };

  const manager = new AudioManager();
  const context = await manager.loadWeatherContext({ forceRefresh: true });

  assert.equal(context.source, 'open-meteo');
  assert.equal(context.resolvedWeatherKind, 'storm');
  assert.deepEqual(context.weatherTrackIds, ['water_drop', 'howling_wind']);
  assert.match(context.formattedAddress, /47\.6062, -122\.3321/);
  assert.match(context.errors.join(' | '), /reverse geocode unavailable/);
  assert.deepEqual(manager.getWeatherTrackIds(['howling_wind']), ['howling_wind']);
});

test('天气配置校验会拦截重复 weather code', () => {
  assert.doesNotThrow(() => validateWeatherAudioRules(WEATHER_AUDIO_RULES));
  assert.throws(
    () =>
      validateWeatherAudioRules({
        ...WEATHER_AUDIO_RULES,
        cloudy: {
          ...WEATHER_AUDIO_RULES.cloudy,
          openMeteoCodes: [0],
        },
      }),
    /重复配置/,
  );
});
