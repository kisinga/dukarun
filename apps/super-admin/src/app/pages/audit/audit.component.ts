import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { AuditRow, Company, PlatformService } from '../../core/platform.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const OP_TYPE: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  INSERT: 'success',
  UPDATE: 'warning',
  DELETE: 'error',
};

@Component({
  selector: 'app-audit',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    PageHeaderComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    DataTableShellComponent,
    DrawerComponent,
    FormFieldComponent,
  ],
  template: `
    <app-page-header title="Audit log" subtitle="Every tracked write, newest first">
      <button
        actions
        class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11"
        title="Refresh audit log"
        aria-label="Refresh audit log"
        [disabled]="loading()"
        (click)="load()"
      >
        <ng-icon name="heroArrowPath" [class.animate-spin]="loading()" />
      </button>
    </app-page-header>

    <div class="card mb-4 bg-base-100">
      <div class="card-body grid items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <app-form-field label="Table">
          <select class="select select-bordered w-full" [formControl]="table">
            <option value="">All</option>
            @for (t of tables(); track t) {
              <option [value]="t">{{ t }}</option>
            }
          </select>
        </app-form-field>
        <app-form-field label="Operation">
          <select class="select select-bordered w-full" [formControl]="operation">
            <option value="">All</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </app-form-field>
        <app-form-field label="Company">
          <select class="select select-bordered w-full" [formControl]="companyId">
            <option value="">All</option>
            @for (c of companies(); track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>
        </app-form-field>
        <app-form-field label="Since">
          <input type="date" class="input input-bordered w-full" [formControl]="since" />
        </app-form-field>
        <button class="btn btn-primary min-h-11" [disabled]="loading()" (click)="load()">
          @if (loading()) {
            <span class="loading loading-spinner loading-sm"></span>
          }
          Apply filters
        </button>
      </div>
    </div>

    @if (error()) {
      <div class="alert alert-error mb-4" role="alert">
        <span>{{ error() }}</span>
      </div>
    }

    @if (rows().length === 0) {
      <app-empty-state
        title="No audit rows"
        description="Tracked table changes appear here as they happen."
      />
    } @else {
      <div class="hidden md:block">
        <app-data-table-shell>
          <table class="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Table</th>
                <th>Op</th>
                <th>Actor</th>
                <th>Company</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.id) {
                <tr
                  role="button"
                  tabindex="0"
                  [class.table-row-active]="selected()?.id === row.id"
                  (click)="openRow(row)"
                  (keydown.enter)="openRow(row)"
                >
                  <td>
                    <span class="text-sm">{{ time(row.changed_at) }}</span>
                  </td>
                  <td class="font-mono text-xs">{{ row.table_name }}</td>
                  <td>
                    <app-status-badge
                      size="xs"
                      [type]="opType(row.operation)"
                      [label]="row.operation"
                    />
                  </td>
                  <td class="font-mono text-xs">
                    {{ row.actor ? '…' + shortId(row.actor) : '—' }}
                  </td>
                  <td class="text-xs">{{ companyName(row.company_id) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </app-data-table-shell>
      </div>

      <div class="space-y-3 md:hidden">
        @for (row of rows(); track row.id) {
          <button
            type="button"
            class="card w-full bg-base-100 p-4 text-left"
            (click)="openRow(row)"
          >
            <span class="flex items-start justify-between gap-3">
              <span>
                <strong class="block text-sm font-mono">{{ row.table_name }}</strong>
                <span class="type-caption mt-1 block">{{ companyName(row.company_id) }}</span>
              </span>
              <app-status-badge size="sm" [type]="opType(row.operation)" [label]="row.operation" />
            </span>
            <span class="type-caption mt-3 block border-t border-base-300/60 pt-3">
              {{ time(row.changed_at) }}
            </span>
          </button>
        }
      </div>
    }

    @if (selected(); as row) {
      <app-drawer
        [open]="drawerOpen()"
        (openChange)="drawerOpen.set($event)"
        title="Audit change"
        [subtitle]="row.table_name + ' · ' + time(row.changed_at)"
        (closed)="selected.set(null)"
      >
        <div class="space-y-6">
          <section>
            <div class="flex items-center gap-2">
              <app-status-badge size="sm" [type]="opType(row.operation)" [label]="row.operation" />
              <span class="type-caption">{{ companyName(row.company_id) }}</span>
            </div>
            <dl class="mt-4 divide-y divide-base-200">
              <div class="flex justify-between gap-4 py-2.5">
                <dt class="type-caption">Actor</dt>
                <dd class="text-sm font-mono">
                  {{ row.actor ? '…' + shortId(row.actor) : 'System' }}
                </dd>
              </div>
              <div class="flex justify-between gap-4 py-2.5">
                <dt class="type-caption">Record</dt>
                <dd class="max-w-64 truncate text-sm font-mono">{{ row.row_id ?? '—' }}</dd>
              </div>
            </dl>
          </section>
          <section class="border-t border-base-300/60 pt-5">
            <h3 class="section-title">Before</h3>
            <pre class="mt-3 max-h-80 overflow-auto rounded-field bg-base-200 p-3 text-xs">{{
              pretty(row.old_data)
            }}</pre>
          </section>
          <section class="border-t border-base-300/60 pt-5">
            <h3 class="section-title">After</h3>
            <pre class="mt-3 max-h-80 overflow-auto rounded-field bg-base-200 p-3 text-xs">{{
              pretty(row.new_data)
            }}</pre>
          </section>
        </div>
      </app-drawer>
    }
  `,
})
export class AuditComponent implements OnInit {
  private readonly platform = inject(PlatformService);

  protected readonly rows = signal<AuditRow[]>([]);
  protected readonly companies = signal<Company[]>([]);
  protected readonly selected = signal<AuditRow | null>(null);
  protected readonly drawerOpen = signal(false);

  protected readonly table = new FormControl('', { nonNullable: true });
  protected readonly operation = new FormControl('', { nonNullable: true });
  protected readonly companyId = new FormControl('', { nonNullable: true });
  protected readonly since = new FormControl('', { nonNullable: true });

  protected readonly tables = signal<string[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.companies.set(await this.platform.companies());
    } catch {
      // company filter stays empty
    }
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.platform.auditLog({
        table: this.table.value || undefined,
        operation: this.operation.value || undefined,
        companyId: this.companyId.value || undefined,
        since: this.since.value
          ? new Date(`${this.since.value}T00:00:00`).toISOString()
          : undefined,
      });
      this.rows.set(rows);
      if (this.tables().length === 0) {
        this.tables.set([...new Set(rows.map(r => r.table_name))].sort());
      }
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      this.loading.set(false);
    }
  }

  protected openRow(row: AuditRow): void {
    this.selected.set(row);
    this.drawerOpen.set(true);
  }

  protected opType(op: string) {
    return OP_TYPE[op] ?? 'neutral';
  }

  protected pretty(value: unknown): string {
    return value === null || value === undefined ? '—' : JSON.stringify(value, null, 2);
  }

  protected shortId(id: string): string {
    return id.slice(-4);
  }

  protected companyName(id: string | null): string {
    if (!id) return '—';
    return this.companies().find(c => c.id === id)?.name ?? id.slice(0, 8);
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
