import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';

/**
 * Service for playing scanner beep sounds matching real hardware specifications
 *
 * Based on official Honeywell scanner documentation:
 * - Honeywell HF680 Series default medium pitch: 2400 Hz
 * - Standard duration: 50 milliseconds
 * - Waveform: Pure sine wave
 *
 * Features:
 * - Single AudioContext instance for efficiency
 * - Handles browser autoplay policy (resumes on user interaction)
 * - Exact frequency match to real supermarket scanners
 * - Graceful degradation when audio unavailable
 */
@Injectable({
    providedIn: 'root',
})
export class ScannerBeepService {
    // Inject PLATFORM_ID using Angular's inject() function at field level
    private readonly platformId = inject(PLATFORM_ID);

    // Hardware specifications matching real scanners
    private readonly FREQUENCY = 2400; // Hz - Honeywell HF680 Series default
    private readonly DURATION = 1000; // milliseconds - industry standard
    private readonly VOLUME = 0.3; // Gain level (moderate, not jarring)

    private audioContext: AudioContext | null = null;
    private isInitialized = false;
    private resumeListeners: Array<() => void> = [];

    /**
     * Play scanner beep sound with exact hardware specifications
     *
     * @param frequency - Frequency in Hz (default: 2400 Hz - Honeywell HF680 Series default)
     * @param duration - Duration in milliseconds (default: 50ms - industry standard)
     * @returns Promise that resolves when beep completes or rejects if unavailable
     */
    async playBeep(frequency?: number, duration?: number): Promise<void> {
        // Only work in browser environment
        if (!isPlatformBrowser(this.platformId)) {
            return Promise.resolve();
        }

        try {
            const context = await this.getAudioContext();
            if (!context) {
                return Promise.resolve();
            }

            // Create oscillator for generating the tone
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();

            // Use provided parameters or defaults (hardware specs)
            const beepFrequency = frequency ?? this.FREQUENCY;
            const beepDuration = duration ?? this.DURATION;

            // Configure oscillator: pure sine wave at specified frequency
            oscillator.type = 'sine';
            oscillator.frequency.value = beepFrequency;

            // Configure gain: moderate volume with smooth fade-out
            gainNode.gain.setValueAtTime(this.VOLUME, context.currentTime);
            // Fade out slightly at the end for smoother sound
            gainNode.gain.exponentialRampToValueAtTime(
                0.01,
                context.currentTime + beepDuration / 1000,
            );

            // Connect nodes: oscillator -> gain -> destination (speakers)
            oscillator.connect(gainNode);
            gainNode.connect(context.destination);

            // Start the oscillator
            oscillator.start(context.currentTime);

            // Stop after specified duration
            oscillator.stop(context.currentTime + beepDuration / 1000);

            // Return promise that resolves when sound finishes
            return new Promise((resolve) => {
                oscillator.onended = () => {
                    resolve();
                };
            });
        } catch (error) {
            // Log error but don't throw - beep failure shouldn't break detection flow
            console.warn('Failed to play scanner beep:', error);
            return Promise.resolve();
        }
    }

    /**
     * Get or create AudioContext, handling autoplay policy
     */
    private async getAudioContext(): Promise<AudioContext | null> {
        if (!isPlatformBrowser(this.platformId)) {
            return null;
        }

        // Check if Web Audio API is available
        if (
            typeof window === 'undefined' ||
            (!window.AudioContext && !(window as any).webkitAudioContext)
        ) {
            console.warn('Web Audio API not available, scanner beep disabled');
            return null;
        }

        // Return existing context if available and running
        if (this.audioContext && this.audioContext.state !== 'closed') {
            // Resume if suspended (handles autoplay policy)
            if (this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                } catch (error) {
                    console.warn('Failed to resume AudioContext:', error);
                }
            }
            return this.audioContext;
        }

        // Create new AudioContext
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            this.audioContext = new AudioContextClass();

            // Set up autoplay policy handling - resume on user interaction
            if (!this.isInitialized) {
                this.setupAutoplayPolicyHandling();
                this.isInitialized = true;
            }

            // Context starts in 'suspended' state due to autoplay policy
            // Try to resume immediately (works if user has already interacted)
            if (this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                } catch (error) {
                    // Expected - will resume on next user interaction
                    console.debug('AudioContext suspended, will resume on user interaction');
                }
            }

            return this.audioContext;
        } catch (error) {
            console.warn('Failed to create AudioContext:', error);
            return null;
        }
    }

    /**
     * Set up event listeners to resume AudioContext on user interaction
     * This handles browser autoplay policy requirements
     */
    private setupAutoplayPolicyHandling(): void {
        if (!isPlatformBrowser(this.platformId)) {
            return;
        }

        const resumeContext = async () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                } catch (error) {
                    console.warn('Failed to resume AudioContext on user interaction:', error);
                }
            }
        };

        // Listen for user interactions that can resume audio
        const events = ['click', 'touchstart', 'keydown'];
        const listeners: Array<() => void> = [];

        events.forEach((eventType) => {
            const listener = () => {
                resumeContext();
                // Remove listener after first successful resume to avoid unnecessary calls
                events.forEach((et) => {
                    document.removeEventListener(et, listeners[events.indexOf(et)], { capture: true });
                });
            };
            listeners.push(listener);
            document.addEventListener(eventType, listener, { capture: true, once: true });
        });

        this.resumeListeners = listeners;
    }

    /**
     * Cleanup: close AudioContext and remove listeners
     * Called automatically when service is destroyed
     */
    ngOnDestroy(): void {
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch((error) => {
                console.warn('Failed to close AudioContext:', error);
            });
            this.audioContext = null;
        }

        // Remove any remaining listeners
        const events = ['click', 'touchstart', 'keydown'];
        this.resumeListeners.forEach((listener, index) => {
            document.removeEventListener(events[index], listener, { capture: true });
        });
        this.resumeListeners = [];
    }
}
