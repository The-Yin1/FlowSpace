export type WeatherAmbience = 'rain' | 'wind';
export type AudioSourceType = 'default' | 'weather';

export type AudioConfig = {
  sourceType: AudioSourceType;
  customWeatherParam: string;
};

/**
 * 天气 → 自然环境轨道映射。
 * 键为 trackId，值对应 audioMixerData 中 nature 分类下的轨道。
 * wind   → 风声、树林风声
 * rain   → 水滴（后续补充雨声 mp3 后自动适配）
 */
const WEATHER_TRACK_MAP: Record<WeatherAmbience, string[]> = {
  wind: ['wind', 'forest_wind'],
  rain: ['water_drop'],
};

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private weatherAmbience: WeatherAmbience = 'wind';
  private audioConfig: AudioConfig = {
    sourceType: 'weather',
    customWeatherParam: '',
  };

  setWeatherAmbience(ambience: WeatherAmbience) {
    this.weatherAmbience = ambience;
  }

  setAudioConfig(config: AudioConfig) {
    this.audioConfig = {
      sourceType: config.sourceType,
      customWeatherParam: config.customWeatherParam.trim(),
    };
  }

  /**
   * 根据当前天气和用户配置，返回应自动激活的自然环境轨道 ID 列表。
   * 若对应轨道在 /public/nature 下暂无 mp3 文件，返回空数组不报错。
   */
  getWeatherTrackIds(): string[] {
    if (this.audioConfig.sourceType === 'default') {
      return [];
    }

    const customValue = this.audioConfig.customWeatherParam.trim().toLowerCase();
    if (customValue) {
      if (
        customValue.includes('雨') ||
        customValue.includes('rain') ||
        customValue.includes('drizzle') ||
        customValue.includes('shower')
      ) {
        return WEATHER_TRACK_MAP['rain'];
      }
      if (
        customValue.includes('风') ||
        customValue.includes('wind') ||
        customValue.includes('breeze')
      ) {
        return WEATHER_TRACK_MAP['wind'];
      }
      if (customValue.includes('storm') || customValue.includes('暴') || customValue.includes('雷')) {
        return WEATHER_TRACK_MAP['rain'];
      }
    }

    return WEATHER_TRACK_MAP[this.weatherAmbience];
  }

  async start() {
    if (this.audioContext) {
      await this.resume();
      return;
    }

    try {
      console.log(`🎵 Initializing AudioManager with ${this.weatherAmbience} ambience...`);

      this.audioContext = new (window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.75;
      this.masterGain.connect(this.audioContext.destination);

      console.log('✅ Audio context initialized (weather-driven mode, no synthetic background).');
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

  /**
   * 心流能量驱动音频增益变化（不再作用于合成噪声，而是影响 Nature 轨道的音量增益）。
   */
  updateEnergy(energy: number) {
    if (!this.masterGain || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    const baseGain = this.getBaseAmbienceGain();
    this.masterGain.gain.setTargetAtTime(baseGain + energy * 0.08, now, 0.1);
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
}
