import { Injectable, inject, signal } from '@angular/core';
import { TracingService } from './tracing.service';

/**
 * Camera stream configuration
 */
export interface CameraConfig {
  facingMode: 'user' | 'environment';
  width?: number;
  height?: number;
  optimizeForMobile?: boolean; // Lower res, framerate when true
}

/**
 * Service for managing device camera access and video streaming
 */
@Injectable({
  providedIn: 'root',
})
export class CameraService {
  private readonly tracingService = inject(TracingService, { optional: true });
  private stream: MediaStream | null = null;
  private readonly isActiveSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);
  private currentSpan: any = null; // Span for current camera session

  readonly isActive = this.isActiveSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /**
   * Start camera stream and attach to video element
   * Returns a cleanup function for easy lifecycle management
   */
  async startCamera(
    videoElement: HTMLVideoElement,
    config: CameraConfig = { facingMode: 'environment' },
  ): Promise<() => void> {
    if (this.stream) {
      console.log('Camera already active');
      return () => this.stopCamera(videoElement);
    }

    // Start telemetry span for camera session
    const span = this.tracingService?.startSpan('camera.start', {
      'camera.facing_mode': config.facingMode,
      'camera.optimize_mobile': (config.optimizeForMobile ?? false).toString(),
    });
    this.currentSpan = span || null;

    this.errorSignal.set(null);

    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const error = new Error('Camera API not available. Please use HTTPS or localhost.');
        if (this.currentSpan) {
          this.tracingService?.setAttributes(this.currentSpan, {
            'camera.result': 'error',
            'camera.error': 'api_not_available',
          });
          this.tracingService?.endSpan(this.currentSpan, false, error);
        }
        this.currentSpan = null;
        throw error;
      }

      // Build constraints with mobile optimization if requested
      const constraints = this.buildConstraints(config);

      console.log('Requesting camera access...');
      if (this.currentSpan) {
        this.tracingService?.addEvent(this.currentSpan, 'camera.requesting_access');
      }
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Attach stream to video element
      videoElement.srcObject = this.stream;

      // CRITICAL: Wait until video can actually play (fixes black screen)
      if (this.currentSpan) {
        this.tracingService?.addEvent(this.currentSpan, 'camera.waiting_for_ready');
      }
      await this.waitForVideoReady(videoElement);

      this.isActiveSignal.set(true);
      console.log('Camera started successfully');

      // Log successful camera start
      if (this.currentSpan) {
        this.tracingService?.setAttributes(this.currentSpan, {
          'camera.result': 'success',
          'camera.video_width': videoElement.videoWidth || 0,
          'camera.video_height': videoElement.videoHeight || 0,
        });
        this.tracingService?.addEvent(this.currentSpan, 'camera.ready');
      }

      // Return cleanup function for easy lifecycle management
      return () => this.stopCamera(videoElement);
    } catch (error: any) {
      console.error('Failed to start camera:', error);
      const errorMessage = this.getUserFriendlyError(error);
      this.errorSignal.set(errorMessage);
      if (this.currentSpan) {
        this.tracingService?.setAttributes(this.currentSpan, {
          'camera.result': 'error',
          'camera.error': error?.name || 'unknown_error',
          'camera.error_message': errorMessage,
        });
        this.tracingService?.endSpan(this.currentSpan, false, error);
      }
      this.currentSpan = null;
      this.stopCamera(videoElement);
      throw error;
    }
  }

  /**
   * Build media stream constraints from config
   */
  private buildConstraints(config: CameraConfig): MediaStreamConstraints {
    const videoConstraints: MediaTrackConstraints = {
      facingMode: config.facingMode,
    };

    if (config.optimizeForMobile) {
      // Mobile-optimized: lower resolution and framerate to save battery
      videoConstraints.width = { ideal: 640, max: 1280 };
      videoConstraints.height = { ideal: 480, max: 720 };
      videoConstraints.frameRate = { ideal: 15, max: 30 };
    } else {
      // Use explicit dimensions if provided
      if (config.width) videoConstraints.width = config.width;
      if (config.height) videoConstraints.height = config.height;
    }

    return {
      video: videoConstraints,
      audio: false,
    };
  }

  /**
   * Wait for video element to be ready to play
   * Uses canplay event which fires when video can actually render frames
   */
  private waitForVideoReady(video: HTMLVideoElement): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // If already ready, resolve immediately
      if (video.readyState >= 3) {
        // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
        video
          .play()
          .then(() => resolve())
          .catch(reject);
        return;
      }

      // Wait for canplay event (video can actually play)
      const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        video
          .play()
          .then(() => resolve())
          .catch(reject);
      };

      const onError = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        reject(new Error('Video element error'));
      };

      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('error', onError);

      // Also try to play immediately in case event already fired
      video.play().catch(() => {
        // Ignore - will be handled by canplay event
      });
    });
  }

  /**
   * Stop camera stream and release resources
   */
  stopCamera(videoElement?: HTMLVideoElement): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (videoElement) {
      videoElement.srcObject = null;
    }

    // End telemetry span if active
    const span = this.currentSpan;
    if (span) {
      this.tracingService?.setAttributes(span, {
        'camera.result': 'stopped',
      });
      this.tracingService?.endSpan(span, true);
      this.currentSpan = null;
    }

    this.isActiveSignal.set(false);
    console.log('Camera stopped');
  }

  /**
   * Switch between front and back camera
   */
  async switchCamera(
    videoElement: HTMLVideoElement,
    currentFacingMode: 'user' | 'environment',
  ): Promise<() => void> {
    const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    this.stopCamera(videoElement);
    return await this.startCamera(videoElement, { facingMode: newFacingMode });
  }

  /**
   * Check if camera is available on device
   */
  async isCameraAvailable(): Promise<boolean> {
    try {
      // Check if mediaDevices API is available (requires HTTPS or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('Camera API not available (requires HTTPS or localhost)');
        return false;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some((device) => device.kind === 'videoinput');
    } catch (error) {
      console.error('Error checking camera availability:', error);
      return false;
    }
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyError(error: any): string {
    const errorName = error.name || '';

    switch (errorName) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Camera permission denied. Please allow camera access in settings.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No camera found on this device.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Camera is already in use by another application.';
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return 'Camera does not support the requested configuration.';
      case 'NotSupportedError':
        return 'Camera access is not supported in this browser.';
      case 'AbortError':
        return 'Camera access was aborted.';
      default:
        return error.message || 'Failed to access camera.';
    }
  }

  /**
   * Get current stream
   */
  getStream(): MediaStream | null {
    return this.stream;
  }
}
