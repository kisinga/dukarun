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
      <div class="flex flex-col gap-2">
        @for (entry of entries(); track entry.id) {
          <div class="card bg-base-100 shadow">
            <div class="card-body p-4">
              <div class="flex flex-wrap items-center gap-3">
                <span class="text-sm font-semibold">{{ entry.entry_date }}</span>
                <span class="text-sm text-base-content/70">{{ entry.memo ?? '—' }}</span>
                <span class="ml-auto font-bold tabular-nums"
                  ><app-money [amount]="total(entry)"
                /></span>
              </div>
              <table class="table table-xs mt-2">
                <tbody>
                  @for (line of entry.ledger_journal_lines; track line.id) {
                    <tr>
                      <td class="font-mono text-xs">{{ line.ledger_accounts?.code }}</td>
                      <td class="text-xs text-base-content/60">{{ line.ledger_accounts?.name }}</td>
                      <td class="text-right text-xs">
                        @if (line.debit > 0) {
                          DR <app-money [amount]="line.debit" />
                        }
                      </td>
                      <td class="text-right text-xs">
                        @if (line.credit > 0) {
                          CR <app-money [amount]="line.credit" />
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class JournalListComponent {
  readonly entries = input.required<JournalEntryWithLines[]>();
  readonly emptyText = input('Nothing posted yet.');
  /** While true the empty state stays hidden (initial fetch in flight). */
  readonly loading = input(false);

  protected total(entry: JournalEntryWithLines): number {
    return entry.ledger_journal_lines.reduce((sum, l) => sum + l.debit, 0);
  }
}
