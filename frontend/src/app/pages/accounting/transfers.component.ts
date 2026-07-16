import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  viewChild,
  signal,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@dukarun/auth';
import { CurrencyService } from '../../shared/services/currency.service';
import { JournalEntry, LedgerService } from '@dukarun/ledger';
import { toDisplayDate } from '../../shared/utils/date.util';
import { TransactionDetailModalComponent } from './components/transaction-detail-modal.component';
import { CreateTransferModalComponent } from './create-transfer-modal.component';
import { sourceTypeLabel } from './utils/accounting-formatting';

const TRANSFER_SOURCE_TYPE = 'inter-account-transfer';

export interface TransferFromTo {
  from: string;
  to: string;
}

@Component({
  selector: 'app-transfers',
  standalone: true,
  imports: [CommonModule, NgIcon, CreateTransferModalComponent, TransactionDetailModalComponent],
  templateUrl: './transfers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransfersComponent implements OnInit {
  private readonly ledgerService = inject(LedgerService);
  private readonly auth = inject(AuthService);
  readonly currencyService = inject(CurrencyService);

  readonly createTransferModal = viewChild(CreateTransferModalComponent);
  readonly detailModal = viewChild(TransactionDetailModalComponent);

  readonly selectedEntry = signal<JournalEntry | null>(null);

  readonly isLoading = this.ledgerService.isLoading;
  readonly error = this.ledgerService.error;
  readonly entries = this.ledgerService.entries;
  readonly totalEntries = this.ledgerService.totalEntries;
  readonly canCreate = this.auth.hasCreateInterAccountTransferPermission;

  ngOnInit(): void {
    this.loadTransfers();
  }

  loadTransfers(): void {
    this.ledgerService.isLoading.set(true);
    this.ledgerService.error.set(null);
    this.ledgerService
      .loadJournalEntries({
        sourceType: TRANSFER_SOURCE_TYPE,
        take: 100,
        skip: 0,
      })
      .subscribe({
        next: () => this.ledgerService.isLoading.set(false),
        error: () => this.ledgerService.isLoading.set(false),
      });
  }

  refresh(): void {
    this.loadTransfers();
  }

  openCreateTransfer(): void {
    this.createTransferModal()?.show();
  }

  onTransferCreated(): void {
    this.refresh();
  }

  onTransferCancelled(): void {}

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents);
  }

  formatDate(dateStr: string): string {
    return toDisplayDate(dateStr, 'medium');
  }

  getEntryAmount(entry: JournalEntry): number {
    return entry.lines.reduce((sum, line) => sum + line.debit, 0);
  }

  /** Derive from/to account names for a transfer entry (credit = from, first debit = to). */
  getTransferFromTo(entry: JournalEntry): TransferFromTo {
    const fromLine = entry.lines.find((l) => l.credit > 0);
    const toLine = entry.lines.find((l) => l.debit > 0);
    return {
      from: fromLine?.accountName ?? fromLine?.accountCode ?? '—',
      to: toLine?.accountName ?? toLine?.accountCode ?? '—',
    };
  }

  async viewEntry(entry: JournalEntry): Promise<void> {
    const full = await firstValueFrom(this.ledgerService.getJournalEntry(entry.id));
    if (full) {
      this.selectedEntry.set(full);
    }
  }

  onDetailClosed(): void {
    this.selectedEntry.set(null);
  }

  sourceTypeLabel = sourceTypeLabel;
}
