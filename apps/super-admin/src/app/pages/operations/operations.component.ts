import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  Company,
  FailedOutboxRow,
  OperationsSnapshot,
  PlatformService,
} from '../../core/platform.service';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

@Component({
  selector: 'app-operations',
  imports: [ReactiveFormsModule, PageHeaderComponent],
  template: `
    <app-page-header title="Operations" subtitle="Registration, accounting and delivery health."
      ><button actions class="btn btn-ghost btn-sm" (click)="load()">
        Refresh
      </button></app-page-header
    >
    @if (error()) {
      <p class="mb-3 text-sm text-error">{{ error() }}</p>
    }
    @if (notice()) {
      <p class="mb-3 text-sm text-success">{{ notice() }}</p>
    }
    @if (snapshot(); as stats) {
      <div class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        @for (stat of cards(stats); track stat.label) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <span class="type-caption">{{ stat.label }}</span
              ><strong
                class="text-2xl tabular-nums"
                [class.text-error]="stat.danger && stat.value > 0"
                >{{ stat.value }}</strong
              >
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
                <span class="flex-1"
                  ><strong>{{ company.name }}</strong
                  ><br /><span class="type-caption"
                    >{{ company.code }} · {{ date(company.created_at) }}</span
                  ></span
                ><button class="btn btn-success btn-outline btn-xs" (click)="approve(company)">
                  Approve
                </button>
              </div>
            } @empty {
              <p class="text-sm text-base-content/60">No registrations waiting.</p>
            }
          </div>
        </div>
      </section>
      <section class="card bg-base-100">
        <form class="card-body p-4" (submit)="$event.preventDefault(); sendBroadcast()">
          <h2 class="type-heading">Platform broadcast</h2>
          <label class="form-control"
            ><span class="label-text text-xs">Title</span
            ><input class="input input-bordered input-sm" [formControl]="title" /></label
          ><label class="form-control"
            ><span class="label-text text-xs">Message</span
            ><textarea class="textarea textarea-bordered" [formControl]="body"></textarea></label
          ><label class="form-control"
            ><span class="label-text text-xs">App link</span
            ><input
              class="input input-bordered input-sm"
              placeholder="/notifications"
              [formControl]="link" /></label
          ><button
            class="btn btn-primary btn-sm self-start"
            [disabled]="busy() || !title.value.trim() || !body.value.trim()"
          >
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
  protected readonly title = new FormControl('', { nonNullable: true });
  protected readonly body = new FormControl('', { nonNullable: true });
  protected readonly link = new FormControl('/notifications', { nonNullable: true });
  async ngOnInit() {
    await this.load();
  }
  protected async load() {
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
  protected async approve(company: Company) {
    try {
      await this.platform.setCompanyStatus(company.id, 'approved');
      this.notice.set(company.name + ' approved');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Approval failed');
    }
  }
  protected async sendBroadcast() {
    this.busy.set(true);
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
  protected date(value: string) {
    return new Date(value).toLocaleString('en-KE');
  }
}
