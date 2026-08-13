import { Component, inject, input, output, signal } from '@angular/core';
import {
  CustomerStatementChannel,
  CustomerStatementPreview,
  CustomerStatementsService,
} from './customer-statements.service';

@Component({
  selector: 'app-customer-statement-send',
  template: `
    <section class="rounded-box border border-base-300 p-3 print:hidden">
      <p class="text-sm font-medium">Send statement</p>
      <p class="type-caption">Share the complete customer account through a seven-day link.</p>

      @if (!channel()) {
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            class="btn btn-outline btn-sm"
            [disabled]="disabled() || busy()"
            (click)="review('sms')"
          >
            Review SMS
          </button>
          <button
            class="btn btn-outline btn-sm"
            [disabled]="disabled() || busy()"
            (click)="review('whatsapp')"
          >
            Review WhatsApp
          </button>
        </div>
      } @else {
        <div class="mt-3 rounded-box bg-base-200/60 p-3" aria-live="polite">
          @if (busy() && !preview()) {
            <div class="flex items-center gap-2 text-sm text-base-content/60">
              <span class="loading loading-spinner loading-sm"></span>
              Preparing message…
            </div>
          } @else if (preview(); as message) {
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-base-content/60">
                  {{ channel() === 'sms' ? 'SMS' : 'WhatsApp' }} to
                </p>
                <p class="text-sm font-medium">
                  {{ message.party_name }} · {{ message.recipient }}
                </p>
              </div>
              <button class="btn btn-ghost btn-xs" [disabled]="busy()" (click)="cancel()">
                Change
              </button>
            </div>
            <p class="mt-3 whitespace-pre-wrap rounded-box bg-base-100 p-3 text-sm">
              {{ message.body }}
            </p>
            @if (channel() === 'whatsapp') {
              <label class="mt-3 flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm mt-0.5"
                  [checked]="bypassQuietHours()"
                  [disabled]="busy()"
                  (change)="toggleBypassQuietHours($event)"
                />
                <span>
                  Send now, even during quiet hours
                  <span class="block text-xs text-base-content/60"
                    >Otherwise it waits for the next delivery window.</span
                  >
                </span>
              </label>
            }
            @if (localError()) {
              <p class="mt-3 text-sm text-error">{{ localError() }}</p>
            }
            <div class="mt-3 flex justify-end gap-2">
              <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="cancel()">
                Cancel
              </button>
              <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="send()">
                @if (busy()) {
                  <span class="loading loading-spinner loading-sm"></span>
                }
                Send {{ channel() === 'sms' ? 'SMS' : 'WhatsApp' }}
              </button>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class CustomerStatementSendComponent {
  private readonly statements = inject(CustomerStatementsService);

  readonly customerId = input.required<string>();
  readonly disabled = input(false);
  readonly sent = output<string>();
  readonly failed = output<string>();

  protected readonly channel = signal<CustomerStatementChannel | null>(null);
  protected readonly preview = signal<CustomerStatementPreview | null>(null);
  protected readonly bypassQuietHours = signal(false);
  protected readonly busy = signal(false);
  protected readonly localError = signal<string | null>(null);

  protected async review(channel: CustomerStatementChannel): Promise<void> {
    this.channel.set(channel);
    this.preview.set(null);
    this.localError.set(null);
    this.busy.set(true);
    try {
      this.preview.set(await this.statements.preview(this.customerId(), channel));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Statement preview could not be loaded';
      this.localError.set(message);
      this.failed.emit(message);
      this.channel.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.channel.set(null);
    this.preview.set(null);
    this.bypassQuietHours.set(false);
    this.localError.set(null);
  }

  protected toggleBypassQuietHours(event: Event): void {
    this.bypassQuietHours.set((event.target as HTMLInputElement).checked);
  }

  protected async send(): Promise<void> {
    const channel = this.channel();
    if (!channel || this.busy()) return;
    this.busy.set(true);
    this.localError.set(null);
    try {
      const result = await this.statements.send(
        this.customerId(),
        channel,
        this.bypassQuietHours()
      );
      this.sent.emit(`Statement queued for ${result.recipient}`);
      this.channel.set(null);
      this.preview.set(null);
      this.bypassQuietHours.set(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Statement could not be sent';
      this.localError.set(message);
      this.failed.emit(message);
    } finally {
      this.busy.set(false);
    }
  }
}
