import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  effect,
  viewChild,
  ElementRef,
} from '@angular/core';
import { JournalEntry } from '../../../../core/services/ledger/ledger.service';

@Component({
  selector: 'app-transaction-detail-modal',
  imports: [CommonModule],
  templateUrl: './transaction-detail-modal.component.html',
  styleUrl: './transaction-detail-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionDetailModalComponent {
  entry = input<JournalEntry | null>(null);
  closed = output<void>();

  readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  readonly isOpen = signal(false);

  constructor() {
    effect(() => {
      if (this.entry()) {
        this.open();
      }
    });
  }

  open() {
    this.isOpen.set(true);
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog) {
      dialog.showModal();
    }
  }

  close() {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog) {
      dialog.close();
    }
    this.isOpen.set(false);
    this.closed.emit();
  }

  formatCurrency(amountInCents: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amountInCents / 100);
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getTotalDebit(entry: JournalEntry | null): number {
    if (!entry) return 0;
    return entry.lines.reduce((sum, line) => sum + line.debit, 0);
  }

  getTotalCredit(entry: JournalEntry | null): number {
    if (!entry) return 0;
    return entry.lines.reduce((sum, line) => sum + line.credit, 0);
  }

  hasMetadata(entry: JournalEntry | null): boolean {
    if (!entry) return false;
    return entry.lines.some((line) => line.meta != null);
  }

  getLinesWithMetadata(entry: JournalEntry | null) {
    if (!entry) return [];
    return entry.lines.filter((line) => line.meta != null);
  }

  formatJson(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }

  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
}
