export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private backgroundOsc: OscillatorNode | null = null;
  private backgroundGain: GainNode | null = null;
  private rhythmOsc: OscillatorNode | null = null;
  private rhythmGain: GainNode | null = null;
  private isPlaying = false;

  constructor() {}

  async start() {
    if (this.isPlaying) return;

    try {
      console.log('🎵 Initializing AudioManager...');

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.audioContext.destination);

      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.value = 200;
      this.lowpassFilter.Q.value = 1;
      this.lowpassFilter.connect(this.masterGain);

      this.backgroundGain = this.audioContext.createGain();
      this.backgroundGain.gain.value = 0.3;
      this.backgroundGain.connect(this.masterGain);

      this.rhythmGain = this.audioContext.createGain();
      this.rhythmGain.gain.value = 0.4;
      this.rhythmGain.connect(this.lowpassFilter);

      this.backgroundOsc = this.audioContext.createOscillator();
      this.backgroundOsc.type = 'sawtooth';
      this.backgroundOsc.frequency.value = 80;
      const bgFilter = this.audioContext.createBiquadFilter();
      bgFilter.type = 'lowpass';
      bgFilter.frequency.value = 400;
      this.backgroundOsc.connect(bgFilter);
      bgFilter.connect(this.backgroundGain);

      this.rhythmOsc = this.audioContext.createOscillator();
      this.rhythmOsc.type = 'square';
      this.rhythmOsc.frequency.value = 200;
      const rhythmGainEnv = this.audioContext.createGain();
      rhythmGainEnv.gain.value = 0.1;
      this.rhythmOsc.connect(rhythmGainEnv);
      rhythmGainEnv.connect(this.rhythmGain);

      const lfo = this.audioContext.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1;
      const lfoGain = this.audioContext.createGain();
      lfoGain.gain.value = 20;
      lfo.connect(lfoGain);
      lfoGain.connect(this.rhythmOsc.frequency);

      this.backgroundOsc.start();
      this.rhythmOsc.start();
      lfo.start();

      this.isPlaying = true;
      console.log('✅ Audio started successfully!');
    } catch (error) {
      console.error('❌ Audio error:', error);
    }
  }

  updateEnergy(energy: number) {
    if (!this.lowpassFilter || !this.audioContext || !this.rhythmGain) return;

    const minFreq = 100;
    const maxFreq = 20000;
    const targetFreq = minFreq + (maxFreq - minFreq) * energy;

    const now = this.audioContext.currentTime;
    this.lowpassFilter.frequency.setTargetAtTime(targetFreq, now, 0.05);

    const rhythmVolume = 0.2 + energy * 0.7;
    this.rhythmGain.gain.setTargetAtTime(rhythmVolume, now, 0.05);

    if (Math.random() < 0.1) {
      console.log(`🎛️ Energy: ${(energy * 100).toFixed(0)}% | Filter: ${targetFreq.toFixed(0)}Hz`);
    }
  }
}
