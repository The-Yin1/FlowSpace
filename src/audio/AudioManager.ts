export type WeatherAmbience = 'rain' | 'wind';
export type AudioSourceType = 'default' | 'weather';

export type AudioConfig = {
  sourceType: AudioSourceType;
  customWeatherParam: string;
};

type BackgroundPreset = 'default' | 'rain' | 'wind' | 'storm';

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private backgroundGain: GainNode | null = null;
  private backgroundFilter: BiquadFilterNode | null = null;
  private backgroundSource: AudioBufferSourceNode | null = null;
  private weatherAmbience: WeatherAmbience = 'wind';
  private activePreset: BackgroundPreset = 'wind';
  private audioConfig: AudioConfig = {
    sourceType: 'weather',
    customWeatherParam: '',
  };

  setWeatherAmbience(ambience: WeatherAmbience) {
    this.weatherAmbience = ambience;
    if (this.audioContext && this.audioConfig.sourceType === 'weather' && !this.audioConfig.customWeatherParam.trim()) {
      this.applyBackgroundProfile();
    }
  }

  setAudioConfig(config: AudioConfig) {
    this.audioConfig = {
      sourceType: config.sourceType,
      customWeatherParam: config.customWeatherParam.trim(),
    };

    if (this.audioContext) {
      this.applyBackgroundProfile();
    }
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

      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.value = 200;
      this.lowpassFilter.Q.value = 1;
      this.lowpassFilter.connect(this.masterGain);

      this.backgroundGain = this.audioContext.createGain();
      this.backgroundFilter = this.audioContext.createBiquadFilter();
      this.backgroundFilter.connect(this.backgroundGain);
      this.backgroundGain.connect(this.masterGain);

      this.backgroundSource = this.audioContext.createBufferSource();
      this.backgroundSource.buffer = this.createNoiseBuffer();
      this.backgroundSource.loop = true;
      this.backgroundSource.connect(this.backgroundFilter);

      this.applyBackgroundProfile();

      this.backgroundSource.start();

      console.log('✅ Audio started successfully!');
    } catch (error) {
      console.error('❌ Audio error:', error);
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
    if (!this.lowpassFilter || !this.audioContext || !this.backgroundGain) return;

    const minFreq = 1200;
    const maxFreq = 20000;
    const targetFreq = minFreq + (maxFreq - minFreq) * energy;
    const now = this.audioContext.currentTime;

    this.lowpassFilter.frequency.setTargetAtTime(targetFreq, now, 0.05);

    const ambienceBaseGain = this.getBaseAmbienceGain();
    this.backgroundGain.gain.setTargetAtTime(ambienceBaseGain + energy * 0.08, now, 0.1);
  }

  private createNoiseBuffer(): AudioBuffer {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    const length = this.audioContext.sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, length, this.audioContext.sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < length; i += 1) {
      channelData[i] = (Math.random() * 2 - 1) * 0.35;
    }

    return buffer;
  }

  private getBaseAmbienceGain(): number {
    switch (this.activePreset) {
      case 'default':
        return 0.12;
      case 'rain':
        return 0.18;
      case 'storm':
        return 0.22;
      case 'wind':
      default:
        return 0.14;
    }
  }

  private resolveBackgroundPreset(): BackgroundPreset {
    if (this.audioConfig.sourceType === 'default') {
      return 'default';
    }

    const customValue = this.audioConfig.customWeatherParam.trim().toLowerCase();

    if (customValue) {
      if (
        customValue.includes('雷') ||
        customValue.includes('暴') ||
        customValue.includes('storm') ||
        customValue.includes('thunder')
      ) {
        return 'storm';
      }

      if (
        customValue.includes('雨') ||
        customValue.includes('drizzle') ||
        customValue.includes('rain') ||
        customValue.includes('shower')
      ) {
        return 'rain';
      }

      if (
        customValue.includes('风') ||
        customValue.includes('wind') ||
        customValue.includes('breeze') ||
        customValue.includes('typhoon')
      ) {
        return 'wind';
      }

      if (
        customValue.includes('tokyo') ||
        customValue.includes('东京') ||
        customValue.includes('london') ||
        customValue.includes('seattle')
      ) {
        return 'rain';
      }

      if (
        customValue.includes('beijing') ||
        customValue.includes('北京') ||
        customValue.includes('kyoto') ||
        customValue.includes('helsinki')
      ) {
        return 'wind';
      }
    }

    return this.weatherAmbience;
  }

  private applyBackgroundProfile() {
    if (!this.audioContext || !this.backgroundFilter || !this.backgroundGain || !this.backgroundSource) {
      return;
    }

    const now = this.audioContext.currentTime;

    this.activePreset = this.resolveBackgroundPreset();

    if (this.activePreset === 'default') {
      this.backgroundFilter.type = 'highpass';
      this.backgroundFilter.frequency.setTargetAtTime(1200, now, 0.2);
      this.backgroundFilter.Q.setTargetAtTime(0.15, now, 0.2);
      this.backgroundGain.gain.setTargetAtTime(0.12, now, 0.2);
      this.backgroundSource.playbackRate.setTargetAtTime(0.9, now, 0.2);
      return;
    }

    if (this.activePreset === 'storm') {
      this.backgroundFilter.type = 'bandpass';
      this.backgroundFilter.frequency.setTargetAtTime(1800, now, 0.2);
      this.backgroundFilter.Q.setTargetAtTime(1.2, now, 0.2);
      this.backgroundGain.gain.setTargetAtTime(0.22, now, 0.2);
      this.backgroundSource.playbackRate.setTargetAtTime(1.08, now, 0.2);
      return;
    }

    if (this.activePreset === 'rain') {
      this.backgroundFilter.type = 'bandpass';
      this.backgroundFilter.frequency.setTargetAtTime(2600, now, 0.2);
      this.backgroundFilter.Q.setTargetAtTime(0.8, now, 0.2);
      this.backgroundGain.gain.setTargetAtTime(0.18, now, 0.2);
      this.backgroundSource.playbackRate.setTargetAtTime(1, now, 0.2);
      return;
    }

    this.backgroundFilter.type = 'lowpass';
    this.backgroundFilter.frequency.setTargetAtTime(420, now, 0.2);
    this.backgroundFilter.Q.setTargetAtTime(0.35, now, 0.2);
    this.backgroundGain.gain.setTargetAtTime(0.14, now, 0.2);
    this.backgroundSource.playbackRate.setTargetAtTime(0.78, now, 0.2);
  }
}
