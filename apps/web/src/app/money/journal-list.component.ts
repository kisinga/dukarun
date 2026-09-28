import { Component, input } from '@angular/core';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { MoneyComponent } from '../shared/ui/money.component';
import type { JournalEntryWithLines } from './money.service';

/** Read-only list of journal entries with their account lines (DR/CR). */
@Component({
  selector: 'app-journal-list',
  imports: [EmptyStateComponent, MoneyComponent],
  template: `
    @if (!loading() && entries().length === 0) {
      <app-empty-state icon="heroBanknotes" [title]="emptyText()" />
    } @else {
      <div class="overflow-hidden rounded-box border border-base-300/70 bg-base-100">
        @for (entry of entries(); track entry.id) {
          <div
            class="border-b border-base-200 p-3 last:border-b-0"
            [attr.data-list-record]="entry.id"
          >
            <div class="flex items-center gap-3">
              <span class="text-sm font-semibold">{{ entry.entry_date }}</span>
              <span
                class="min-w-0 flex-1 whitespace-normal break-words text-sm text-base-content/70"
                >{{ entry.memo ?? '—' }}</span
              >
              <span class="ml-auto font-bold tabular-nums"
                ><app-money [amount]="total(entry)"
              /></span>
            </div>
            <details class="journal-entry-detail mt-1">
              <summary
                class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs"
              >
                <span class="min-w-0 text-muted whitespace-normal">{{
                  accountSummary(entry)
                }}</span>
                <span class="shrink-0 font-semibold"
                  >Account lines
                  <span class="journal-entry-chevron" aria-hidden="true">⌄</span></span
                >
              </summary>
              <div class="border-t border-base-300/70 pt-1">
                @for (line of entry.ledger_journal_lines; track line.id) {
                  <div class="flex items-center gap-2 py-1 text-xs">
                    <span class="font-mono font-semibold">{{ line.ledger_accounts?.code }}</span>
                    <span class="min-w-0 flex-1 truncate text-base-content/60">{{
                      line.ledger_accounts?.name
                    }}</span>
                    <span class="shrink-0 tabular-nums">
                      @if (line.debit > 0) {
                        DR <app-money [amount]="line.debit" />
                      }
                      @if (line.credit > 0) {
                        CR <app-money [amount]="line.credit" />
                      }
                    </span>
                  </div>
                }
              </div>
            </details>
          </div>
        }
      </div>
    }
  `,
  styles: `
    summary::-webkit-details-marker {
      display: none;
    }
    .journal-entry-chevron {
      display: inline-block;
    }
    details[open] .journal-entry-chevron {
      transform: rotate(180deg);
    }
    summary:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
  `,
})
export class JournalListComponent {
  readonly entries = input.required<JournalEntryWithLines[]>();
  readonly emptyText = input('Nothing posted yet.');
  /** While true the empty state stays hidden (initial fetch in flight). */
  readonly loading = input(false);
  readonly context = input<'expense' | 'transfer' | 'journal'>('journal');

  protected accountSummary(entry: JournalEntryWithLines): string {
    const lines = entry.ledger_journal_lines;
    const debit = lines.filter(line => line.debit > 0);
    const credit = lines.filter(line => line.credit > 0);
    const name = (line: (typeof lines)[number]) =>
      line.ledger_accounts?.name || line.ledger_accounts?.code || 'Unknown account';
    const known = (line: (typeof lines)[number]) => !!line.ledger_accounts?.code;
    if (
      this.context() === 'transfer' &&
      entry.source_type === 'InterAccountTransfer' &&
      lines.length === 2 &&
      debit.length === 1 &&
      credit.length === 1 &&
      known(debit[0]) &&
      known(credit[0]) &&
      debit[0].ledger_accounts?.code !== credit[0].ledger_accounts?.code
    ) {
      return `From ${name(credit[0])} → To ${name(debit[0])}`;
    }
    if (
      this.context() === 'expense' &&
      entry.source_type === 'Expense' &&
      lines.length === 2 &&
      credit.length === 1 &&
      known(credit[0]) &&
      debit.length === 1 &&
      known(debit[0]) &&
      debit[0].ledger_accounts?.code !== credit[0].ledger_accounts?.code
    ) {
      return `Paid from: ${name(credit[0])}`;
    }
    const accounts = [...new Set(lines.map(name))];
    return `Accounts: ${accounts.length ? accounts.join(' · ') : 'Not available'}`;
  }

  protected total(entry: JournalEntryWithLines): number {
    return entry.ledger_journal_lines.reduce((sum, l) => sum + l.debit, 0);
  }
}
