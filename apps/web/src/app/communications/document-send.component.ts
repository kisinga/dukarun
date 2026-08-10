import { Component, inject, input, output, signal } from '@angular/core';
import {
  ExternalDocumentChannel,
  ExternalDocumentPreview,
  ExternalDocumentType,
  ExternalDocumentsService,
} from './external-documents.service';

@Component({
  selector: 'app-document-send',
  template: `
    <section class="rounded-box border border-base-300 p-3">
      <p class="text-sm font-medium">{{ title() }}</p>
      <p class="type-caption">{{ description() }}</p>

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

            <div class="mt-3 space-y-2">
              @if (allowCompanyCopy()) {
                <label class="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm mt-0.5"
                    [checked]="includeCompanyCopy()"
                    [disabled]="busy()"
                    (change)="toggleCompanyCopy($event)"
                  />
                  <span>
                    Send a company copy
                    <span class="block text-xs text-base-content/60"
                      >Uses the configured company WhatsApp number.</span
                    >
                  </span>
                </label>
              }
              @if (channel() === 'whatsapp' || includeCompanyCopy()) {
                <label class="flex cursor-pointer items-start gap-2 text-sm">
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
                      >Otherwise it waits until the next delivery window.</span
                    >
                  </span>
                </label>
              }
            </div>

            @if (message.company_copy_body) {
              <div class="mt-3">
                <p class="text-xs font-medium uppercase tracking-wide text-base-content/60">
                  Company copy
                </p>
                <p class="mt-1 whitespace-pre-wrap rounded-box bg-base-100 p-3 text-sm">
                  {{ message.company_copy_body }}
                </p>
              </div>
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
export class DocumentSendComponent {
  private readonly documents = inject(ExternalDocumentsService);

  readonly documentType = input.required<ExternalDocumentType>();
  readonly subjectId = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input('Fixed wording and a secure, read-only document link.');
  readonly allowCompanyCopy = input(false);
  readonly disabled = input(false);
  readonly sent = output<string>();
  readonly failed = output<string>();

  protected readonly channel = signal<ExternalDocumentChannel | null>(null);
  protected readonly preview = signal<ExternalDocumentPreview | null>(null);
  protected readonly includeCompanyCopy = signal(false);
  protected readonly bypassQuietHours = signal(false);
  protected readonly busy = signal(false);
  protected readonly localError = signal<string | null>(null);

  protected async review(channel: ExternalDocumentChannel): Promise<void> {
    this.channel.set(channel);
    this.preview.set(null);
    this.localError.set(null);
    await this.loadPreview();
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.channel.set(null);
    this.preview.set(null);
    this.includeCompanyCopy.set(false);
    this.bypassQuietHours.set(false);
    this.localError.set(null);
  }

  protected async toggleCompanyCopy(event: Event): Promise<void> {
    this.includeCompanyCopy.set((event.target as HTMLInputElement).checked);
    await this.loadPreview();
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
      const result = await this.documents.send(
        this.documentType(),
        this.subjectId(),
        channel,
        this.includeCompanyCopy(),
        this.bypassQuietHours()
      );
      const label = this.title().replace(/^Send\s+/i, '');
      this.sent.emit(
        `${label} queued for ${result.recipient}` +
          (result.company_copy_error ? `; company copy failed: ${result.company_copy_error}` : '')
      );
      this.cancelAfterSend();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document could not be sent';
      this.localError.set(message);
      this.failed.emit(message);
    } finally {
      this.busy.set(false);
    }
  }

  private async loadPreview(): Promise<void> {
    const channel = this.channel();
    if (!channel) return;
    this.busy.set(true);
    this.localError.set(null);
    try {
      this.preview.set(
        await this.documents.preview(
          this.documentType(),
          this.subjectId(),
          channel,
          this.includeCompanyCopy()
        )
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Document preview could not be loaded';
      this.localError.set(message);
      this.failed.emit(message);
      this.channel.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  private cancelAfterSend(): void {
    this.channel.set(null);
    this.preview.set(null);
    this.includeCompanyCopy.set(false);
    this.bypassQuietHours.set(false);
  }
}
