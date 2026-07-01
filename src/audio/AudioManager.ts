export type WeatherAmbience = 'rain' | 'wind';

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private backgroundGain: GainNode | null = null;
  private backgroundFilter: BiquadFilterNode | null = null;
  private backgroundSource: AudioBufferSourceNode | null = null;
  private rhythmOsc: OscillatorNode | null = null;
  private rhythmGain: GainNode | null = null;
  private rhythmLfo: OscillatorNode | null = null;
  private rhythmLfoGain: GainNode | null = null;
  private isPlaying = false;
  private weatherAmbience: WeatherAmbience = 'wind';

  setWeatherAmbience(ambience: WeatherAmbience) {
    this.weatherAmbience = ambience;
    if (this.audioContext) {
      this.applyWeatherProfile();
    }
  }

  async start() {
    if (this.isPlaying) return;

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

      this.rhythmGain = this.audioContext.createGain();
      this.rhythmGain.gain.value = 0.25;
      this.rhythmGain.connect(this.lowpassFilter);

      this.rhythmOsc = this.audioContext.createOscillator();
      this.rhythmOsc.type = 'square';
      this.rhythmOsc.frequency.value = 180;

      const rhythmEnvelope = this.audioContext.createGain();
      rhythmEnvelope.gain.value = 0.08;
      this.rhythmOsc.connect(rhythmEnvelope);
      rhythmEnvelope.connect(this.rhythmGain);

      this.rhythmLfo = this.audioContext.createOscillator();
      this.rhythmLfo.type = 'sine';
      this.rhythmLfo.frequency.value = 1;
      this.rhythmLfoGain = this.audioContext.createGain();
      this.rhythmLfoGain.gain.value = 18;
      this.rhythmLfo.connect(this.rhythmLfoGain);
      this.rhythmLfoGain.connect(this.rhythmOsc.frequency);

      this.applyWeatherProfile();

      this.backgroundSource.start();
      this.rhythmOsc.start();
      this.rhythmLfo.start();

      this.isPlaying = true;
      console.log('✅ Audio started successfully!');
    } catch (error) {
      console.error('❌ Audio error:', error);
    }
  }

  updateEnergy(energy: number) {
    if (!this.lowpassFilter || !this.audioContext || !this.rhythmGain || !this.backgroundGain) return;

    const minFreq = 100;
    const maxFreq = 20000;
    const targetFreq = minFreq + (maxFreq - minFreq) * energy;
    const now = this.audioContext.currentTime;

    this.lowpassFilter.frequency.setTargetAtTime(targetFreq, now, 0.05);

    const rhythmVolume = 0.18 + energy * 0.55;
    this.rhythmGain.gain.setTargetAtTime(rhythmVolume, now, 0.05);

    const ambienceBaseGain = this.weatherAmbience === 'rain' ? 0.18 : 0.14;
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

  private applyWeatherProfile() {
    if (!this.audioContext || !this.backgroundFilter || !this.backgroundGain || !this.rhythmOsc || !this.rhythmLfo) {
      return;
    }

    const now = this.audioContext.currentTime;

    if (this.weatherAmbience === 'rain') {
      this.backgroundFilter.type = 'bandpass';
      this.backgroundFilter.frequency.setTargetAtTime(2600, now, 0.15);
      this.backgroundFilter.Q.setTargetAtTime(0.8, now, 0.15);
      this.backgroundGain.gain.setTargetAtTime(0.18, now, 0.15);
      this.rhythmOsc.frequency.setTargetAtTime(220, now, 0.15);
      this.rhythmLfo.frequency.setTargetAtTime(1.25, now, 0.15);
    } else {
      this.backgroundFilter.type = 'lowpass';
      this.backgroundFilter.frequency.setTargetAtTime(420, now, 0.15);
      this.backgroundFilter.Q.setTargetAtTime(0.35, now, 0.15);
      this.backgroundGain.gain.setTargetAtTime(0.14, now, 0.15);
      this.rhythmOsc.frequency.setTargetAtTime(160, now, 0.15);
      this.rhythmLfo.frequency.setTargetAtTime(0.75, now, 0.15);
    }
  }
}
