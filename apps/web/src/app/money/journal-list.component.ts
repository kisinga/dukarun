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
          <div class="border-b border-base-200 p-3 last:border-b-0">
            <div class="flex items-center gap-3">
              <span class="text-sm font-semibold">{{ entry.entry_date }}</span>
              <span class="min-w-0 flex-1 truncate text-sm text-base-content/70">{{
                entry.memo ?? '—'
              }}</span>
              <span class="ml-auto font-bold tabular-nums"
                ><app-money [amount]="total(entry)"
              /></span>
            </div>
            <div class="mt-2 divide-y divide-base-200/60">
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
