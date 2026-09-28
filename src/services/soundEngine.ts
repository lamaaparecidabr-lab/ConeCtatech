/**
 * Web Audio API synthesizer mimicking Harley-Davidson 45-degree V-Twin exhaust pulse
 */
export class HarleySoundEngine {
  private audioCtx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isMuted: boolean = true;
  private isRunning: boolean = false;

  public init() {
    if (this.audioCtx) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    } catch (e) {
      console.warn('AudioContext not supported');
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.gainNode) {
      this.gainNode.gain.value = muted ? 0 : 0.08;
    }
  }

  public start() {
    if (this.isRunning || !this.audioCtx) return;

    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.isMuted ? 0 : 0.08;
      this.gainNode.connect(this.audioCtx.destination);

      // Low frequency rumble for cylinder 1 & 2
      this.osc1 = this.audioCtx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.value = 32;

      this.osc2 = this.audioCtx.createOscillator();
      this.osc2.type = 'triangle';
      this.osc2.frequency.value = 64;

      this.osc1.connect(this.gainNode);
      this.osc2.connect(this.gainNode);

      this.osc1.start();
      this.osc2.start();
      this.isRunning = true;
    } catch (e) {
      console.warn('Audio start error', e);
    }
  }

  public updateRpm(rpm: number) {
    if (!this.isRunning || !this.osc1 || !this.osc2 || !this.gainNode) return;
    if (rpm <= 0) {
      this.gainNode.gain.value = 0;
      return;
    }

    // Harley V-Twin frequency: idle ~900 RPM = ~15 Hz exhaust events per cylinder
    const baseFreq = Math.max(20, (rpm / 60) * 1.5);
    this.osc1.frequency.setTargetAtTime(baseFreq, this.audioCtx!.currentTime, 0.05);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.5, this.audioCtx!.currentTime, 0.05);

    if (!this.isMuted) {
      // Slightly higher volume at higher revs
      const volume = Math.min(0.12, 0.04 + (rpm / 6000) * 0.08);
      this.gainNode.gain.setTargetAtTime(volume, this.audioCtx!.currentTime, 0.05);
    }
  }

  public stop() {
    try {
      if (this.osc1) {
        this.osc1.stop();
        this.osc1.disconnect();
        this.osc1 = null;
      }
      if (this.osc2) {
        this.osc2.stop();
        this.osc2.disconnect();
        this.osc2 = null;
      }
      this.isRunning = false;
    } catch (e) {
      console.warn(e);
    }
  }
}

export const soundEngine = new HarleySoundEngine();
