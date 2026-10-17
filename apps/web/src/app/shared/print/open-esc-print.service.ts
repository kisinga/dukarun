import { Injectable, signal } from '@angular/core';
import type { PrintJob } from '@dukarun/documents';
import {
  prepareOpenEsc,
  launchOpenEsc,
  type PreparedBrowserPrint,
} from '../../../../../../packages/documents/browser-print';
import {
  openEscSupported,
  readThermalPrintProfile,
  THERMAL_PROFILE_KEY,
  type DevicePrintMethod,
  type ThermalPrintProfile,
} from './open-esc';
const METHOD_KEY = 'dukarun-print-method';
export type { ThermalPrintProfile } from './open-esc';
export interface OpenEscJob {
  title: string;
  preparing: boolean;
  error: string;
  retry?: () => Promise<void>;
  systemPrint?: () => Promise<void>;
}
@Injectable({ providedIn: 'root' })
export class OpenEscPrintService {
  readonly method = signal<DevicePrintMethod>(this.loadMethod());
  readonly supported = openEscSupported();
  readonly profile = signal<ThermalPrintProfile>(readThermalPrintProfile());
  /** Only failures interrupt the normal one-tap flow. */
  readonly pending = signal<OpenEscJob | null>(null);
  setMethod(value: string): void {
    if (value !== 'system' && value !== 'open-esc') return;
    this.method.set(value);
    try {
      localStorage.setItem(METHOD_KEY, value);
    } catch {
      /* Session preference still works. */
    }
  }
  setProfile(widthCm: number, dpi: number): void {
    if (
      !Number.isFinite(widthCm) ||
      widthCm < 2 ||
      widthCm > 12 ||
      !Number.isInteger(dpi) ||
      dpi < 100 ||
      dpi > 600
    )
      return;
    this.profile.set({ widthCm, dpi });
    try {
      localStorage.setItem(THERMAL_PROFILE_KEY, JSON.stringify(this.profile()));
    } catch {
      /* Session choice. */
    }
  }
  prepare(job: PrintJob): Promise<PreparedBrowserPrint> {
    if (!this.supported)
      return Promise.reject(new Error('Use Android Chrome to print with Open ESC.'));
    return prepareOpenEsc(job, this.profile());
  }
  launch(job: PreparedBrowserPrint): void {
    launchOpenEsc(job);
  }
  fail(
    title: string,
    error: unknown,
    systemPrint?: () => Promise<void>,
    retry?: () => Promise<void>
  ): void {
    this.pending.set({
      title,
      preparing: false,
      error: error instanceof Error ? error.message : 'Printing could not be prepared.',
      systemPrint,
      retry,
    });
  }
  async useSystemPrinter(): Promise<void> {
    await this.recover('systemPrint');
  }
  async retry(): Promise<void> {
    await this.recover('retry');
  }
  close(): void {
    this.pending.set(null);
  }
  private async recover(action: 'systemPrint' | 'retry'): Promise<void> {
    const job = this.pending();
    if (!job?.[action] || job.preparing) return;
    const working = { ...job, preparing: true };
    this.pending.set(working);
    try {
      await job[action]!();
      if (this.pending() === working) this.close();
    } catch (error) {
      if (this.pending() === working) this.fail(job.title, error, job.systemPrint, job.retry);
    }
  }
  private loadMethod(): DevicePrintMethod {
    try {
      return localStorage.getItem(METHOD_KEY) === 'open-esc' ? 'open-esc' : 'system';
    } catch {
      return 'system';
    }
  }
}
