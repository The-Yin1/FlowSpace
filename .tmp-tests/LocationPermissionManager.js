import { invoke } from '@tauri-apps/api/core';
const STORAGE_KEY = 'flowspace_location_permission';
const STORAGE_VERSION = 1;
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
    static getInstance() {
        if (!LocationPermissionManager.instance) {
            LocationPermissionManager.instance = new LocationPermissionManager();
        }
        return LocationPermissionManager.instance;
    }
    constructor() {
        this.cachedSnapshot = null;
        this.cacheTimestamp = 0;
        this.restoreCachedState();
    }
    // ---------- 公开 API ----------
    /**
     * 获取完整的权限状态快照（含浏览器层 + 系统层）。
     * 默认使用 30 秒缓存，避免频繁触发系统调用。
     */
    async getPermissionSnapshot(forceRefresh = false) {
        if (!forceRefresh && this.cachedSnapshot && Date.now() - this.cacheTimestamp < 30000) {
            return this.cachedSnapshot;
        }
        const browserPermission = await this.queryBrowserPermission();
        let systemLocationEnabled = true;
        let systemPermissionMessage = '';
        let platform = 'browser';
        let state = this.mapBrowserToState(browserPermission);
        if (this.isTauriEnvironment()) {
            try {
                const systemStatus = await invoke('check_location_permission');
                systemLocationEnabled = systemStatus.systemLocationEnabled;
                systemPermissionMessage = systemStatus.message;
                platform = systemStatus.platform;
                // 系统层状态优先于浏览器层
                if (!systemLocationEnabled) {
                    state = 'systemDisabled';
                }
                else if (systemStatus.appLocationAuthorized === true) {
                    state = 'authorized';
                }
                else if (systemStatus.appLocationAuthorized === false) {
                    state = 'denied';
                }
                else if (systemStatus.authorizationStatus === 'restricted') {
                    state = 'restricted';
                }
                else if (systemStatus.authorizationStatus === 'notDetermined') {
                    state = 'notDetermined';
                }
            }
            catch (error) {
                console.error('❌ 系统定位权限查询失败，回退到浏览器状态:', error);
            }
        }
        const snapshot = {
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
    async requestPermission() {
        if (!('geolocation' in navigator)) {
            return this.buildUnavailableSnapshot('当前设备不支持定位接口。');
        }
        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(() => {
                this.cachedSnapshot = null; // 强制刷新
                this.getPermissionSnapshot(true).then(resolve);
            }, (_error) => {
                this.cachedSnapshot = null;
                this.getPermissionSnapshot(true).then(resolve);
            }, {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 0,
            });
        });
    }
    /**
     * 打开系统定位隐私设置页面（跨平台）。
     */
    async openSystemLocationSettings() {
        try {
            await invoke('open_privacy_settings', { target: 'location' });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('❌ 打开系统定位设置失败:', message);
            // 浏览器降级：无法打开系统设置时给出明确指引
            alert('请手动打开系统设置：\n' +
                '• macOS: 系统设置 → 隐私与安全性 → 定位服务\n' +
                '• Windows: 设置 → 隐私与安全性 → 位置\n' +
                '• Linux: 系统设置 → 隐私 → 位置服务');
        }
    }
    /**
     * 判断当前是否可以发起定位请求。
     */
    canRequestLocation() {
        if (!this.cachedSnapshot) {
            return true; // 未查询过，先假设可以
        }
        return this.cachedSnapshot.state === 'authorized' || this.cachedSnapshot.state === 'notDetermined';
    }
    /**
     * 对定位失败进行标准化分类，返回可读的错误信息。
     */
    classifyLocationError(error) {
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
    listenForPermissionChanges(onChange) {
        if (!('permissions' in navigator) || !navigator.permissions?.query) {
            return () => { };
        }
        let isActive = true;
        const setupListener = async () => {
            try {
                const status = await navigator.permissions.query({ name: 'geolocation' });
                if (!isActive)
                    return;
                const handler = () => {
                    if (!isActive)
                        return;
                    this.cachedSnapshot = null;
                    this.getPermissionSnapshot(true).then(onChange);
                };
                status.addEventListener('change', handler);
                // 存储清理引用
                const cleanupRef = { status, handler };
                this._permissionListener = cleanupRef;
            }
            catch {
                // 不支持，静默忽略
            }
        };
        setupListener();
        return () => {
            isActive = false;
            const ref = this._permissionListener;
            if (ref) {
                ref.status.removeEventListener('change', ref.handler);
                delete this._permissionListener;
            }
        };
    }
    // ---------- 内部方法 ----------
    async queryBrowserPermission() {
        if (!('permissions' in navigator) || !navigator.permissions?.query) {
            return 'unsupported';
        }
        try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            return result.state;
        }
        catch {
            return 'unsupported';
        }
    }
    mapBrowserToState(browserState) {
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
    buildUnavailableSnapshot(message) {
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
    isTauriEnvironment() {
        return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    }
    // ---------- 持久化 ----------
    restoreCachedState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw)
                return;
            const stored = JSON.parse(raw);
            if (stored.version !== STORAGE_VERSION)
                return;
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
        }
        catch {
            // 解析失败，忽略缓存
        }
    }
    persistState(state) {
        try {
            const data = {
                version: STORAGE_VERSION,
                state,
                updatedAt: Date.now(),
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
        catch {
            // 存储不可用，静默忽略
        }
    }
}
