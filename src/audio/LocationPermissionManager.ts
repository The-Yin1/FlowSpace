import { invoke } from '@tauri-apps/api/core';

/**
 * 定位权限的当前状态枚举，比浏览器原生 PermissionState 更细化。
 */
export type LocationPermissionState =
  | 'notDetermined'   // 从未申请过权限
  | 'authorized'      // 已授权，可使用定位
  | 'denied'          // 用户拒绝了权限
  | 'restricted'      // 系统限制（如家长控制）
  | 'systemDisabled'  // 系统级定位服务已关闭
  | 'unavailable'     // 当前环境不支持定位
  | 'unknown';        // 无法确定（降级）

/**
 * 与 Rust 端 LocationPermissionStatus 保持对齐的完整权限快照。
 */
export type LocationPermissionSnapshot = {
  state: LocationPermissionState;
  canPrompt: boolean;
  /** 浏览器层 Permission API 原始状态 */
  browserPermission: PermissionState | 'unsupported';
  /** 系统层权限状态（Tauri 环境下有效） */
  systemLocationEnabled: boolean;
  systemPermissionMessage: string;
  platform: string;
  lastCheckedAt: number;
};

export type NativeLocationPayload = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestampMs: number;
  authorizationStatus: string;
  systemLocationEnabled: boolean;
};

/**
 * 定位失败的错误码分类，便于前端展示针对性提示。
 */
export type LocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'PERMISSION_TIMEOUT'
  | 'PERMISSION_UNAVAILABLE'
  | 'POSITION_UNAVAILABLE'
  | 'POSITION_TIMEOUT'
  | 'SYSTEM_DISABLED'
  | 'UNKNOWN';

export type LocationError = {
  code: LocationErrorCode;
  message: string;
  recoverable: boolean;
};

const STORAGE_KEY = 'flowspace_location_permission';
const STORAGE_VERSION = 1;

type StoredPermission = {
  version: number;
  state: LocationPermissionState;
  updatedAt: number;
};

/**
 * 系统级定位权限管理器。
 *
 * 职责：
 * 1. 统一查询浏览器 Permission API 和 Tauri 系统层定位权限状态
 * 2. 将权限状态持久化到 localStorage，减少重复系统调用
 * 3. 监听浏览器权限变更事件（permissionstatechange）
 * 4. 提供打开系统隐私设置的跨平台入口
 * 5. 对定位失败场景进行标准化错误分类
 *
 * 使用方式：
 *   const permissionManager = LocationPermissionManager.getInstance();
 *   const status = await permissionManager.getPermissionSnapshot();
 *   if (!status.canPrompt) {
 *     await permissionManager.openSystemLocationSettings();
 *   }
 */
export class LocationPermissionManager {
  private static instance: LocationPermissionManager;

  private cachedSnapshot: LocationPermissionSnapshot | null = null;
  private cacheTimestamp = 0;

  static getInstance(): LocationPermissionManager {
    if (!LocationPermissionManager.instance) {
      LocationPermissionManager.instance = new LocationPermissionManager();
    }
    return LocationPermissionManager.instance;
  }

  private constructor() {
    this.restoreCachedState();
  }

  // ---------- 公开 API ----------

  /**
   * 获取完整的权限状态快照（含浏览器层 + 系统层）。
   * 默认使用 30 秒缓存，避免频繁触发系统调用。
   */
  async getPermissionSnapshot(forceRefresh = false): Promise<LocationPermissionSnapshot> {
    if (!forceRefresh && this.cachedSnapshot && Date.now() - this.cacheTimestamp < 30_000) {
      return this.cachedSnapshot;
    }

    const browserPermission = await this.queryBrowserPermission();
    let systemLocationEnabled = true;
    let systemPermissionMessage = '';
    let platform = 'browser';
    let state = this.mapBrowserToState(browserPermission);

    if (this.isTauriEnvironment()) {
      try {
        const systemStatus = await invoke<{
          platform: string;
          systemLocationEnabled: boolean;
          appLocationAuthorized: boolean | null;
          authorizationStatus: string;
          canPrompt: boolean;
          message: string;
        }>('check_location_permission');
        systemLocationEnabled = systemStatus.systemLocationEnabled;
        systemPermissionMessage = systemStatus.message;
        platform = systemStatus.platform;

        // 系统层状态优先于浏览器层
        if (!systemLocationEnabled) {
          state = 'systemDisabled';
        } else if (
          systemStatus.authorizationStatus === 'authorizedWhenInUse' ||
          systemStatus.authorizationStatus === 'authorizedAlways' ||
          systemStatus.authorizationStatus === 'authorized'
        ) {
          state = 'authorized';
        } else if (systemStatus.appLocationAuthorized === true) {
          state = 'authorized';
        } else if (systemStatus.appLocationAuthorized === false) {
          state = 'denied';
        } else if (systemStatus.authorizationStatus === 'restricted') {
          state = 'restricted';
        } else if (
          systemStatus.authorizationStatus === 'notDetermined' ||
          systemStatus.authorizationStatus === 'promptable'
        ) {
          state = 'notDetermined';
        }

        const snapshot: LocationPermissionSnapshot = {
          state,
          canPrompt: systemStatus.canPrompt,
          browserPermission,
          systemLocationEnabled,
          systemPermissionMessage,
          platform,
          lastCheckedAt: Date.now(),
        };

        this.cachedSnapshot = snapshot;
        this.cacheTimestamp = snapshot.lastCheckedAt;
        this.persistState(state);
        return snapshot;
      } catch (error) {
        console.error('❌ 系统定位权限查询失败，回退到浏览器状态:', error);
      }
    }

    const snapshot: LocationPermissionSnapshot = {
      state,
      canPrompt: state === 'notDetermined' || state === 'authorized',
      browserPermission,
      systemLocationEnabled,
      systemPermissionMessage,
      platform,
      lastCheckedAt: Date.now(),
    };

    this.cachedSnapshot = snapshot;
    this.cacheTimestamp = snapshot.lastCheckedAt;
    this.persistState(state);

    return snapshot;
  }

  /**
   * 主动触发定位权限申请（调用 navigator.geolocation.getCurrentPosition）。
   * 浏览器会在此时弹出系统级权限提示。
   */
  async requestPermission(): Promise<LocationPermissionSnapshot> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('request_location_permission');
      } catch (error) {
        console.error('❌ 系统级定位权限请求失败，降级为浏览器 geolocation:', error);
      }
      this.cachedSnapshot = null;
      return this.getPermissionSnapshot(true);
    }

    if (!('geolocation' in navigator)) {
      return this.buildUnavailableSnapshot('当前设备不支持定位接口。');
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          this.cachedSnapshot = null; // 强制刷新
          this.getPermissionSnapshot(true).then(resolve);
        },
        (_error) => {
          this.cachedSnapshot = null;
          this.getPermissionSnapshot(true).then(resolve);
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 0,
        },
      );
    });
  }

  async requestNativeLocation(): Promise<NativeLocationPayload> {
    if (!this.isTauriEnvironment()) {
      throw new Error('当前环境未启用原生定位桥接。');
    }

    return invoke<NativeLocationPayload>('fetch_native_location');
  }

  invalidateSnapshot(): void {
    this.cachedSnapshot = null;
    this.cacheTimestamp = 0;
  }

  async refreshAfterNativeLocation(nativeLocation: NativeLocationPayload): Promise<LocationPermissionSnapshot> {
    const inferredState: LocationPermissionState =
      nativeLocation.authorizationStatus === 'authorized' ||
      nativeLocation.authorizationStatus === 'authorizedAlways' ||
      nativeLocation.authorizationStatus === 'authorizedWhenInUse'
        ? 'authorized'
        : nativeLocation.authorizationStatus === 'denied'
          ? 'denied'
          : nativeLocation.authorizationStatus === 'restricted'
            ? 'restricted'
            : nativeLocation.authorizationStatus === 'notDetermined'
              ? 'notDetermined'
              : 'unknown';

    this.cachedSnapshot = {
      state: inferredState,
      canPrompt: inferredState === 'notDetermined',
      browserPermission: 'unsupported',
      systemLocationEnabled: nativeLocation.systemLocationEnabled,
      systemPermissionMessage:
        inferredState === 'authorized'
          ? '已通过 macOS 原生定位获取到当前位置，定位权限状态已同步。'
          : '',
      platform: 'macos',
      lastCheckedAt: Date.now(),
    };
    this.cacheTimestamp = this.cachedSnapshot.lastCheckedAt;
    this.persistState(this.cachedSnapshot.state);

    return this.cachedSnapshot;
  }

  /**
   * 打开系统定位隐私设置页面（跨平台）。
   */
  async openSystemLocationSettings(): Promise<void> {
    try {
      await invoke('open_privacy_settings', { target: 'location' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ 打开系统定位设置失败:', message);
      // 浏览器降级：无法打开系统设置时给出明确指引
      alert(
        '请手动打开系统设置：\n' +
          '• macOS: 系统设置 → 隐私与安全性 → 定位服务\n' +
          '• Windows: 设置 → 隐私与安全性 → 位置\n' +
          '• Linux: 系统设置 → 隐私 → 位置服务',
      );
    }
  }

  /**
   * 判断当前是否可以发起定位请求。
   */
  canRequestLocation(): boolean {
    if (!this.cachedSnapshot) {
      return true; // 未查询过，先假设可以
    }
    return this.cachedSnapshot.state === 'authorized' || this.cachedSnapshot.state === 'notDetermined';
  }

  /**
   * 对定位失败进行标准化分类，返回可读的错误信息。
   */
  classifyLocationError(error: GeolocationPositionError): LocationError {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return {
          code: 'PERMISSION_DENIED',
          message: '定位权限被拒绝。请前往系统设置开启定位权限后重试。',
          recoverable: true,
        };
      case error.TIMEOUT:
        return {
          code: 'PERMISSION_TIMEOUT',
          message: '定位请求超时，请检查网络连接后重试。',
          recoverable: true,
        };
      case error.POSITION_UNAVAILABLE:
        return {
          code: 'POSITION_UNAVAILABLE',
          message: '无法获取当前位置信息，已降级到默认策略。',
          recoverable: false,
        };
      default:
        return {
          code: 'UNKNOWN',
          message: `定位失败（错误码: ${error.code}），已降级到默认策略。`,
          recoverable: false,
        };
    }
  }

  /**
   * 开始监听浏览器权限变更（仅在支持的浏览器上生效）。
   * 返回取消监听的函数。
   */
  listenForPermissionChanges(onChange: (snapshot: LocationPermissionSnapshot) => void): () => void {
    let isActive = true;
    let cleanupBrowserListener = () => {};
    const focusHandler = () => {
      if (!isActive) {
        return;
      }
      this.cachedSnapshot = null;
      this.getPermissionSnapshot(true).then(onChange).catch(() => {});
    };
    window.addEventListener('focus', focusHandler);

    if (!('permissions' in navigator) || !navigator.permissions?.query) {
      return () => {
        isActive = false;
        window.removeEventListener('focus', focusHandler);
      };
    }

    const setupListener = async () => {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (!isActive) return;

        const handler = () => {
          if (!isActive) return;
          this.cachedSnapshot = null;
          this.getPermissionSnapshot(true).then(onChange);
        };

        status.addEventListener('change', handler);

        // 存储清理引用
        const cleanupRef = { status, handler };
        (this as unknown as Record<string, unknown>)._permissionListener = cleanupRef;
        cleanupBrowserListener = () => {
          status.removeEventListener('change', handler);
        };
      } catch {
        // 不支持，静默忽略
      }
    };

    setupListener();

    return () => {
      isActive = false;
      window.removeEventListener('focus', focusHandler);
      cleanupBrowserListener();
      const ref = (this as unknown as Record<string, unknown>)._permissionListener as
        | { status: PermissionStatus; handler: () => void }
        | undefined;
      if (ref) {
        delete (this as unknown as Record<string, unknown>)._permissionListener;
      }
    };
  }

  // ---------- 内部方法 ----------

  private async queryBrowserPermission(): Promise<PermissionState | 'unsupported'> {
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

  private mapBrowserToState(browserState: PermissionState | 'unsupported'): LocationPermissionState {
    switch (browserState) {
      case 'granted':
        return 'authorized';
      case 'denied':
        return 'denied';
      case 'prompt':
        return 'notDetermined';
      default:
        return 'unknown';
    }
  }

  private buildUnavailableSnapshot(message: string): LocationPermissionSnapshot {
    return {
      state: 'unavailable',
      canPrompt: false,
      browserPermission: 'unsupported',
      systemLocationEnabled: false,
      systemPermissionMessage: message,
      platform: 'browser',
      lastCheckedAt: Date.now(),
    };
  }

  private isTauriEnvironment(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  // ---------- 持久化 ----------

  private restoreCachedState(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const stored: StoredPermission = JSON.parse(raw);
      if (stored.version !== STORAGE_VERSION) return;

      // 仅用于启动时快速给出预估状态，不代替实时查询
      this.cachedSnapshot = {
        state: stored.state,
        canPrompt: stored.state === 'notDetermined' || stored.state === 'authorized',
        browserPermission: 'unsupported',
        systemLocationEnabled: true,
        systemPermissionMessage: '',
        platform: 'unknown',
        lastCheckedAt: stored.updatedAt,
      };
    } catch {
      // 解析失败，忽略缓存
    }
  }

  private persistState(state: LocationPermissionState): void {
    try {
      const data: StoredPermission = {
        version: STORAGE_VERSION,
        state,
        updatedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 存储不可用，静默忽略
    }
  }
}
