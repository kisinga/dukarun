import {
  Component,
  ElementRef,
  OnDestroy,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SaleDocumentService,
  type ReceiptContact,
  type SaleDocumentContext,
} from './sale-document.service';
import { PrintService, type PrintFormat } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { PermissionsService } from '../core/permissions.service';
import { normalizeKenyanPhone } from '../core/phone';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';

@Component({
  selector: 'app-sale-document-modal',
  imports: [FormsModule, ButtonComponent, FormFieldComponent, IconComponent],
  template: `
    <dialog
      #dialog
      class="modal receipt-dialog"
      aria-labelledby="receipt-heading"
      (cancel)="close($event)"
    >
      @if (service.modal()) {
        <section
          class="modal-box modal-box-task modal-box-compact receipt-panel bg-base-100 text-base-content"
        >
          <header class="px-5 pt-5 pb-3">
            @if (service.modal()?.celebrate) {
              <p class="mb-2 flex items-center gap-2 text-sm font-medium text-success">
                <app-icon name="heroCheckCircle" /> Sale completed
              </p>
            }
            <h2 id="receipt-heading" tabindex="-1" autofocus #heading class="type-heading">
              {{ taskTitle() }}
            </h2>
          </header>
          <div class="modal-body receipt-body space-y-4 px-5 pb-4">
            @if (context() || service.modal()?.total !== undefined) {
              <div
                class="flex min-w-0 flex-wrap items-end justify-between gap-3 border-y border-base-300/60 py-3"
              >
                <div class="min-w-0">
                  <p class="type-caption">
                    {{ context()?.document_type === 'invoice' ? 'Invoice' : 'Receipt' }} · PDF
                  </p>
                  <p class="break-words text-sm font-semibold">
                    {{
                      context()?.document_number || service.modal()?.code || 'Preparing document…'
                    }}
                  </p>
                </div>
                <p class="type-hero">
                  {{ money(context()?.total ?? service.modal()?.total ?? 0) }}
                </p>
              </div>
            }
            @if (context()?.document_type === 'invoice') {
              <p class="text-sm">Invoice · Balance {{ money(context()!.balance) }}</p>
            }
            @if (!canSend()) {
              <p class="text-sm text-base-content/65">
                Print your sale document here. WhatsApp sending requires settlement or
                communications access.
              </p>
            } @else if (context(); as ctx) {
              @if (!ctx.eligible) {
                <p class="text-sm">This sale is not ready for a receipt or invoice yet.</p>
              } @else if (ctx.has_customer && !ctx.customer) {
                <p class="text-sm">
                  The linked customer is unavailable. Ask a manager to review their account.
                </p>
              } @else if (ctx.customer; as customer) {
                <div class="space-y-1">
                  <p class="type-caption">Send to</p>
                  <p class="font-medium">{{ customer.first_name }} {{ customer.last_name }}</p>
                  <p class="text-sm text-base-content/65">
                    {{ customer.phone || 'No saved phone number' }}
                  </p>
                  @if (ctx.can_correct_number && !correcting()) {
                    <button appButton variant="ghost" size="sm" (click)="startCorrection(customer)">
                      Correct number
                    </button>
                  }
                </div>
                @if (correcting()) {
                  <app-form-field
                    label="Correct phone number"
                    hint="This updates the customer account and cancels unsent documents to the old number."
                  >
                    <input
                      class="input w-full"
                      type="tel"
                      inputmode="tel"
                      maxlength="30"
                      [(ngModel)]="correctedPhone"
                    />
                  </app-form-field>
                  <div class="flex gap-2">
                    <button
                      appButton
                      variant="outline"
                      [loading]="savingNumber()"
                      (click)="saveCorrection()"
                    >
                      Update customer number
                    </button>
                    <button appButton variant="ghost" (click)="correcting.set(false)">
                      Cancel
                    </button>
                  </div>
                }
              } @else {
                <app-form-field
                  label="WhatsApp number"
                  [required]="true"
                  hint="Use a Kenyan mobile number."
                >
                  <input
                    class="input w-full"
                    type="tel"
                    inputmode="tel"
                    autocomplete="tel"
                    maxlength="30"
                    [ngModel]="phone()"
                    (ngModelChange)="changePhone($event)"
                  />
                </app-form-field>
                @if (lookingUp()) {
                  <p class="text-sm" role="status">Checking number…</p>
                }
                @if (matched(); as contact) {
                  <p class="rounded-box bg-base-200 p-3 text-sm">
                    Use {{ contact.first_name }} {{ contact.last_name }} ·
                    {{ contact.is_verified ? 'Verified' : 'Unverified' }}
                  </p>
                } @else {
                  <div class="grid grid-cols-2 gap-3">
                    <app-form-field label="First name" [required]="true">
                      <input
                        class="input w-full"
                        autocomplete="given-name"
                        maxlength="100"
                        [ngModel]="firstName()"
                        (ngModelChange)="firstName.set($event)"
                      />
                    </app-form-field>
                    <app-form-field label="Second name" hint="Optional">
                      <input
                        class="input w-full"
                        autocomplete="family-name"
                        maxlength="100"
                        [(ngModel)]="lastName"
                      />
                    </app-form-field>
                  </div>
                }
              }
              @if (ctx.delivery; as delivery) {
                <p role="status" class="rounded-box bg-base-200 p-3 text-sm">
                  {{ stateLabel(delivery.state) }}
                  @if (delivery.state === 'sent') {
                    · {{ delivery.recipient }}
                  }
                  @if (delivery.state === 'unknown') {
                    The gateway may have accepted this PDF. Check with the customer before sending
                    again.
                  }
                  @if (delivery.state === 'failed') {
                    Please check the customer details and try again.
                  }
                </p>
              }
            } @else if (loading()) {
              <p role="status" class="text-sm">Loading customer details…</p>
            }
            @if (error()) {
              <p role="alert" class="text-sm text-error">{{ error() }}</p>
            }
            @if (showSizes()) {
              <app-form-field label="Print paper size">
                <select
                  class="select w-full"
                  [ngModel]="print.format()"
                  (ngModelChange)="setFormat($event)"
                >
                  @for (format of print.getAvailableTemplates(); track format.id) {
                    <option [value]="format.id">{{ format.width }}</option>
                  }
                </select>
              </app-form-field>
            }
          </div>
          <footer class="space-y-2 border-t border-base-300 px-5 py-4">
            @if (canSend()) {
              @if (confirmResend()) {
                <p class="text-sm">Send another copy to {{ context()?.customer?.phone }}?</p>
                <div class="flex gap-2">
                  <button appButton class="flex-1" [loading]="sending()" (click)="send(true)">
                    Send another PDF
                  </button>
                  <button appButton variant="ghost" (click)="confirmResend.set(false)">
                    Cancel
                  </button>
                </div>
              } @else {
                <button
                  appButton
                  class="w-full"
                  [disabled]="!sendEnabled()"
                  [loading]="sending()"
                  (click)="send()"
                >
                  {{
                    context()?.delivery ? 'Send PDF again via WhatsApp' : 'Send PDF via WhatsApp'
                  }}
                </button>
              }
            }
            <div class="flex gap-2">
              <button
                appButton
                variant="outline"
                class="flex-1"
                [loading]="printing()"
                (click)="printDocument()"
              >
                <app-icon name="heroPrinter" /> Print
              </button>
              <button appButton variant="ghost" (click)="close()">Done</button>
            </div>
            <button
              appButton
              variant="ghost"
              size="sm"
              class="w-full"
              (click)="showSizes.set(!showSizes())"
            >
              Change size ·
              {{
                print.format() === 'a4' ? 'A4' : print.format() === 'receipt-80mm' ? '80mm' : '52mm'
              }}
            </button>
          </footer>
        </section>
      }
    </dialog>
  `,
  styles: `
    .receipt-dialog {
      inset: 0;
      top: var(--modal-visual-offset, 0px);
      border: 0;
      padding: 0;
      margin: 0;
      width: 100%;
      max-width: none;
      height: var(--modal-visual-height, 100dvh);
      max-height: none;
      background: var(--overlay-backdrop-bg);
      overflow: hidden;
    }
    .receipt-dialog[open] {
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .receipt-panel {
      padding: 0;
    }
    footer {
      flex-shrink: 0;
      padding-bottom: max(1rem, env(safe-area-inset-bottom));
    }
    .receipt-dialog[open] .receipt-panel {
      animation: receipt-enter 180ms ease-out both;
    }
    @keyframes receipt-enter {
      0% {
        opacity: 0;
        transform: translateY(8px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @media (min-width: 768px) {
      .receipt-dialog[open] {
        align-items: center;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .receipt-dialog[open] .receipt-panel {
        animation: none;
      }
    }
  `,
})
export class SaleDocumentModalComponent implements OnDestroy {
  protected readonly service = inject(SaleDocumentService);
  protected readonly print = inject(PrintService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly permissions = inject(PermissionsService);
  protected readonly money = formatKes;
  protected readonly context = signal<SaleDocumentContext | null>(null);
  protected readonly loading = signal(false);
  protected readonly sending = signal(false);
  protected readonly printing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly phone = signal('');
  protected readonly matched = signal<ReceiptContact | null>(null);
  protected readonly lookingUp = signal(false);
  protected readonly correcting = signal(false);
  protected readonly savingNumber = signal(false);
  protected readonly showSizes = signal(false);
  protected readonly confirmResend = signal(false);
  protected readonly firstName = signal('');
  protected lastName = '';
  protected correctedPhone = '';
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private previousFocus: HTMLElement | null = null;
  private lookupTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private requestKey = crypto.randomUUID();
  private requestAccepted = false;
  private generation = 0;
  private refreshVersion = 0;
  private lookupVersion = 0;
  private savedOverflow = '';
  private readonly resize = () => {
    const style = this.dialog()?.nativeElement.style;
    style?.setProperty(
      '--modal-visual-height',
      `${window.visualViewport?.height ?? window.innerHeight}px`
    );
    style?.setProperty('--modal-visual-offset', `${window.visualViewport?.offsetTop ?? 0}px`);
  };
  protected readonly canSend = computed(
    () => this.permissions.has('SettleOrder') || this.permissions.has('ManageCommunications')
  );
  protected readonly taskTitle = computed(() => {
    const context = this.context();
    if (!context?.eligible || !this.canSend()) return 'Sale document';
    return context.document_type === 'invoice' ? 'Send invoice' : 'Send receipt';
  });
  protected readonly sendEnabled = computed(() => {
    const ctx = this.context();
    return (
      !!ctx?.eligible &&
      !this.correcting() &&
      !this.sending() &&
      !this.lookingUp() &&
      !['queued', 'preparing', 'sending'].includes(ctx.delivery?.state ?? '') &&
      (ctx.has_customer
        ? !!ctx.customer?.phone
        : !!normalizeKenyanPhone(this.phone()) && (!!this.matched() || !!this.firstName().trim()))
    );
  });
  constructor() {
    effect(() => {
      const modal = this.service.modal();
      ++this.generation;
      ++this.lookupVersion;
      clearTimeout(this.pollTimer);
      clearTimeout(this.lookupTimer);
      if (!modal) return;
      this.context.set(null);
      this.error.set(null);
      this.phone.set('');
      this.matched.set(null);
      this.firstName.set('');
      this.lastName = '';
      this.correcting.set(false);
      this.confirmResend.set(false);
      this.sending.set(false);
      this.lookingUp.set(false);
      this.requestKey = crypto.randomUUID();
      this.requestAccepted = false;
      void this.refresh(this.generation);
    });
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.service.modal() && !dialog.open) {
        this.previousFocus = document.activeElement as HTMLElement;
        this.savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
        this.heading()?.nativeElement.focus({ preventScroll: true });
        this.resize();
        window.visualViewport?.addEventListener('resize', this.resize);
        window.visualViewport?.addEventListener('scroll', this.resize);
      } else if (!this.service.modal() && dialog.open) {
        dialog.close();
        this.restoreFocus();
      }
    });
  }
  protected close(event?: Event): void {
    event?.preventDefault();
    this.service.modal.set(null);
  }
  private restoreFocus(): void {
    document.body.style.overflow = this.savedOverflow;
    window.visualViewport?.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('scroll', this.resize);
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }
  ngOnDestroy(): void {
    ++this.generation;
    clearTimeout(this.pollTimer);
    clearTimeout(this.lookupTimer);
    if (this.dialog()?.nativeElement.open) this.restoreFocus();
    this.service.modal.set(null);
  }
  private async refresh(generation: number): Promise<void> {
    const modal = this.service.modal();
    if (!modal) return;
    clearTimeout(this.pollTimer);
    const version = ++this.refreshVersion;
    const current = () => generation === this.generation && version === this.refreshVersion;
    this.loading.set(true);
    try {
      const ctx = await this.service.context(modal.orderId);
      if (!current()) return;
      this.context.set(ctx);
      this.error.set(null);
      if (['queued', 'preparing', 'sending'].includes(ctx.delivery?.state ?? ''))
        this.pollTimer = setTimeout(() => void this.refresh(generation), 2000);
    } catch (error) {
      if (current()) {
        this.error.set(this.message(error));
        this.pollTimer = setTimeout(() => void this.refresh(generation), 2000);
      }
    } finally {
      if (current()) this.loading.set(false);
    }
  }
  protected changePhone(value: string): void {
    this.phone.set(value);
    this.matched.set(null);
    this.error.set(null);
    clearTimeout(this.lookupTimer);
    const version = ++this.lookupVersion;
    if (!normalizeKenyanPhone(value)) {
      this.lookingUp.set(false);
      return;
    }
    this.lookingUp.set(true);
    this.lookupTimer = setTimeout(async () => {
      try {
        const contact = await this.service.lookup(value);
        if (version === this.lookupVersion) this.matched.set(contact);
      } catch (error) {
        if (version === this.lookupVersion) this.error.set(this.message(error));
      } finally {
        if (version === this.lookupVersion) this.lookingUp.set(false);
      }
    }, 300);
  }
  protected startCorrection(customer: ReceiptContact): void {
    this.correctedPhone = customer.phone ?? '';
    this.correcting.set(true);
  }
  protected async saveCorrection(): Promise<void> {
    const customer = this.context()?.customer;
    if (!customer || this.savingNumber()) return;
    this.savingNumber.set(true);
    this.error.set(null);
    try {
      await this.service.correctPhone(customer, this.correctedPhone);
      this.correcting.set(false);
      this.requestKey = crypto.randomUUID();
      await this.refresh(this.generation);
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.savingNumber.set(false);
    }
  }
  protected async send(confirmed = false): Promise<void> {
    const ctx = this.context();
    if (!ctx || !this.sendEnabled()) return;
    if (ctx.delivery && !confirmed) {
      this.confirmResend.set(true);
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    clearTimeout(this.pollTimer);
    ++this.refreshVersion;
    // Rotate only for an explicit new delivery. Ambiguous HTTP retries retain their key.
    if (confirmed && this.requestAccepted) {
      this.requestKey = crypto.randomUUID();
      this.requestAccepted = false;
    }
    const generation = this.generation;
    try {
      const accepted = await this.service.send(
        ctx.order_id,
        this.requestKey,
        ctx.has_customer
          ? undefined
          : {
              phone: normalizeKenyanPhone(this.phone())!,
              first_name: this.matched()?.first_name ?? this.firstName().trim(),
              last_name: this.matched()?.last_name ?? this.lastName.trim(),
            }
      );
      if (generation !== this.generation) return;
      this.requestAccepted = true;
      this.context.set({
        ...ctx,
        delivery: {
          id: accepted.outbox_id,
          state: accepted.state,
          recipient: ctx.customer?.phone ?? normalizeKenyanPhone(this.phone())!,
          sent_at: null,
          error: null,
        },
      });
      this.confirmResend.set(false);
      await this.refresh(generation);
    } catch (error) {
      if (generation === this.generation) this.error.set(this.message(error));
    } finally {
      if (generation === this.generation) this.sending.set(false);
    }
  }
  protected async printDocument(): Promise<void> {
    const modal = this.service.modal();
    if (!modal || this.printing()) return;
    this.printing.set(true);
    this.error.set(null);
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildSaleDocumentData(modal.orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta, company.address);
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.printing.set(false);
    }
  }
  protected setFormat(format: PrintFormat): void {
    this.print.setFormat(format);
  }
  protected stateLabel(state: string): string {
    return (
      (
        {
          queued: 'Queued',
          preparing: 'Preparing PDF',
          sending: 'Sending',
          sent: 'Sent',
          failed: 'Sending failed',
          unknown: 'Delivery outcome unknown',
          cancelled: 'Send cancelled',
        } as Record<string, string>
      )[state] ?? state
    );
  }
  private message(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Please try again.';
    return (
      (
        {
          phone_belongs_to_another_customer: 'This number already belongs to another customer.',
          customer_changed_reload:
            'This customer was updated elsewhere. Close and reopen the receipt to load their latest details.',
          document_send_in_progress:
            'A document is being sent. Wait for it to finish before correcting the number.',
          document_send_pending:
            'This document is already queued. Close and reopen the receipt to check its progress.',
          external_messaging_disabled:
            'WhatsApp messaging is disabled for this business. Ask a manager to enable it.',
          recipient_has_no_phone: 'Add a saved phone number to this customer before sending.',
          completed_sale_required: 'Complete this sale before sending its document.',
          invalid_phone: 'Enter a valid Kenyan mobile number.',
        } as Record<string, string>
      )[message] ?? message
    );
  }
}
