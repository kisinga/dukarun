import { Injectable } from '@angular/core';

type AudioContextConstructor = new () => AudioContext;

/** Small, dependency-free confirmation cue for a barcode that was actually accepted. */
@Injectable({ providedIn: 'root' })
export class ScanFeedbackService {
  private context: AudioContext | null = null;

  playSuccess(): void {
    const AudioContextClass =
      (globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor })
        .AudioContext ??
      (globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      this.context ??= new AudioContextClass();
      const context = this.context;
      void context.resume().then(() => {
        const now = context.currentTime;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
        gain.connect(context.destination);

        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.setValueAtTime(1175, now + 0.045);
        oscillator.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + 0.115);
      });
      navigator.vibrate?.(30);
    } catch {
      // Audio feedback is best-effort; barcode acceptance must never depend on it.
    }
  }
}
