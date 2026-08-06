import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import {
  Company,
  FailedOutboxRow,
  OperationsSnapshot,
  PlatformService,
} from '../../core/platform.service';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';

@Component({
  selector: 'app-operations',
  imports: [ReactiveFormsModule, NgIcon, PageHeaderComponent, EmptyStateComponent],
  template: `
    <app-page-header title="Operations" subtitle="Registration, accounting and delivery health">
      <button
        actions
        class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11"
        title="Refresh operations"
        aria-label="Refresh operations"
        [disabled]="loading()"
        (click)="load()"
      >
        <ng-icon name="heroArrowPath" [class.animate-spin]="loading()" />
      </button>
    </app-page-header>
    @if (error()) {
      <div class="alert alert-error mb-4" role="alert">
        <span>{{ error() }}</span>
      </div>
    }
    @if (notice()) {
      <div class="alert alert-success mb-4" role="status">
        <span>{{ notice() }}</span>
      </div>
    }
    @if (snapshot(); as stats) {
      <div class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        @for (stat of cards(stats); track stat.label) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <span class="type-caption">{{ stat.label }}</span
              ><strong class="type-hero" [class.text-error]="stat.danger && stat.value > 0">{{
                stat.value
              }}</strong>
            </div>
          </div>
        }
      </div>
    }
    <div class="grid gap-4 xl:grid-cols-2">
      <section class="card bg-base-100">
        <div class="card-body p-4">
          <h2 class="type-heading">Pending registrations</h2>
          <div class="mt-2 divide-y divide-base-200">
            @for (company of pending(); track company.id) {
              <div class="flex items-center gap-2 py-2">
                <span class="min-w-0 flex-1">
                  <strong class="block truncate">{{ company.name }}</strong>
                  <span class="type-caption">
                    {{ company.code }} · {{ date(company.created_at) }}
                  </span>
                </span>
                <button
                  class="btn btn-outline btn-sm min-h-11"
                  [disabled]="approvingId() !== null"
                  (click)="approve(company)"
                >
                  @if (approvingId() === company.id) {
                    <span class="loading loading-spinner loading-sm"></span>
                  }
                  {{ approvingId() === company.id ? 'Approving…' : 'Approve' }}
                </button>
              </div>
            } @empty {
              <app-empty-state
                [embedded]="true"
                title="All caught up"
                description="No registrations are waiting for approval."
              />
            }
          </div>
        </div>
      </section>
      <section class="card bg-base-100">
        <form class="card-body p-4" (submit)="$event.preventDefault(); sendBroadcast()">
          <h2 class="type-heading">Platform broadcast</h2>
          <label class="form-control">
            <span class="label-text">Title</span>
            <input class="input input-bordered input-sm w-full" [formControl]="title" />
          </label>
          <label class="form-control">
            <span class="label-text">Message</span>
            <textarea class="textarea textarea-bordered w-full" [formControl]="body"></textarea>
          </label>
          <label class="form-control">
            <span class="label-text">App link</span>
            <input
              class="input input-bordered input-sm"
              placeholder="/notifications"
              [formControl]="link"
            />
          </label>
          <button
            class="btn btn-primary btn-sm min-h-11 self-start"
            [disabled]="busy() || !title.value.trim() || !body.value.trim()"
          >
            @if (busy()) {
              <span class="loading loading-spinner loading-sm"></span>
            }
            Send to approved companies
          </button>
        </form>
      </section>
      <section class="card overflow-hidden bg-base-100 xl:col-span-2">
        <div class="border-b border-base-300 px-4 py-3">
          <h2 class="type-heading">Failed outbound messages</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>When</th>
                <th>Company</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Error</th>
                <th class="text-right">Attempts</th>
              </tr>
            </thead>
            <tbody>
              @for (row of failures(); track row.id) {
                <tr>
                  <td>{{ date(row.created_at) }}</td>
                  <td>{{ row.companies?.name || row.company_id }}</td>
                  <td>{{ row.channel }}</td>
                  <td>{{ row.recipient }}</td>
                  <td class="max-w-md truncate text-error">{{ row.error }}</td>
                  <td class="text-right">{{ row.attempts }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="text-center text-base-content/60">No failed messages.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
})
export class OperationsComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly snapshot = signal<OperationsSnapshot | null>(null);
  protected readonly pending = signal<Company[]>([]);
  protected readonly failures = signal<FailedOutboxRow[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly approvingId = signal<string | null>(null);
  protected readonly title = new FormControl('', { nonNullable: true });
  protected readonly body = new FormControl('', { nonNullable: true });
  protected readonly link = new FormControl('/notifications', { nonNullable: true });
  async ngOnInit(): Promise<void> {
    await this.load();
  }
  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [snapshot, pending, failures] = await Promise.all([
        this.platform.operationsSnapshot(),
        this.platform.pendingCompanies(),
        this.platform.failedOutbox(),
      ]);
      this.snapshot.set(snapshot);
      this.pending.set(pending);
      this.failures.set(failures);
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Load failed');
    } finally {
      this.loading.set(false);
    }
  }
  protected cards(s: OperationsSnapshot) {
    return [
      { label: 'Pending companies', value: s.pending_companies, danger: false },
      { label: 'Active memberships', value: s.active_memberships, danger: false },
      { label: 'Failed messages', value: s.failed_outbox, danger: true },
      { label: 'Unbalanced journals', value: s.unbalanced_journals, danger: true },
    ];
  }
  protected async approve(company: Company): Promise<void> {
    this.approvingId.set(company.id);
    this.error.set(null);
    try {
      await this.platform.setCompanyStatus(company.id, 'approved');
      this.notice.set(company.name + ' approved');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Approval failed');
    } finally {
      this.approvingId.set(null);
    }
  }
  protected async sendBroadcast(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const count = await this.platform.broadcast(
        this.title.value.trim(),
        this.body.value.trim(),
        this.link.value.trim() || undefined
      );
      this.notice.set(`Broadcast sent to ${count} companies`);
      this.title.setValue('');
      this.body.setValue('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Broadcast failed');
    } finally {
      this.busy.set(false);
    }
  }
  protected date(value: string): string {
    return new Date(value).toLocaleString('en-KE');
  }
}
