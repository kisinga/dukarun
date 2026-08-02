import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuditRow, Company, PlatformService } from '../../core/platform.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const OP_TYPE: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  INSERT: 'success',
  UPDATE: 'warning',
  DELETE: 'error',
};

@Component({
  selector: 'app-audit',
  imports: [ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent, StatusBadgeComponent],
  template: `
    <app-page-header title="Audit log" subtitle="Every tracked write, newest first" />

    <!-- Filters -->
    <div class="card mb-3 bg-base-100">
      <div class="card-body flex-row flex-wrap items-end gap-3 p-4">
        <label class="form-control">
          <span class="label-text text-xs">Table</span>
          <select class="select select-bordered select-sm" [formControl]="table">
            <option value="">All</option>
            @for (t of tables(); track t) {
              <option [value]="t">{{ t }}</option>
            }
          </select>
        </label>
        <label class="form-control">
          <span class="label-text text-xs">Operation</span>
          <select class="select select-bordered select-sm" [formControl]="operation">
            <option value="">All</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text text-xs">Company</span>
          <select class="select select-bordered select-sm" [formControl]="companyId">
            <option value="">All</option>
            @for (c of companies(); track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>
        </label>
        <label class="form-control">
          <span class="label-text text-xs">Since</span>
          <input type="date" class="input input-bordered input-sm" [formControl]="since" />
        </label>
        <button class="btn btn-primary btn-sm min-h-11" (click)="load()">Apply</button>
      </div>
    </div>

    @if (error()) {
      <p class="mb-2 text-sm text-error">{{ error() }}</p>
    }

    @if (rows().length === 0) {
      <app-empty-state
        title="No audit rows"
        description="Tracked table changes appear here as they happen."
      />
    } @else {
      <div class="card bg-base-100">
        <table class="table table-sm">
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
              <tr>
                <td>
                  <button class="link text-sm" (click)="toggle(row.id)">
                    {{ time(row.changed_at) }}
                  </button>
                </td>
                <td class="font-mono text-xs">{{ row.table_name }}</td>
                <td>
                  <app-status-badge
                    size="xs"
                    [type]="opType(row.operation)"
                    [label]="row.operation"
                  />
                </td>
                <td class="font-mono text-xs">{{ row.actor ? '…' + shortId(row.actor) : '—' }}</td>
                <td class="text-xs">{{ companyName(row.company_id) }}</td>
              </tr>
              @if (expandedFor() === row.id) {
                <tr class="row-detail">
                  <td colspan="5">
                    <div class="grid gap-3 lg:grid-cols-2">
                      <div>
                        <h4 class="type-heading mb-1">Before</h4>
                        <pre class="overflow-auto rounded-field bg-base-200 p-2 text-xs">{{
                          pretty(row.old_data)
                        }}</pre>
                      </div>
                      <div>
                        <h4 class="type-heading mb-1">After</h4>
                        <pre class="overflow-auto rounded-field bg-base-200 p-2 text-xs">{{
                          pretty(row.new_data)
                        }}</pre>
                      </div>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AuditComponent implements OnInit {
  private readonly platform = inject(PlatformService);

  protected readonly rows = signal<AuditRow[]>([]);
  protected readonly companies = signal<Company[]>([]);
  protected readonly expandedFor = signal<number | null>(null);

  protected readonly table = new FormControl('', { nonNullable: true });
  protected readonly operation = new FormControl('', { nonNullable: true });
  protected readonly companyId = new FormControl('', { nonNullable: true });
  protected readonly since = new FormControl('', { nonNullable: true });

  protected readonly tables = signal<string[]>([]);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.companies.set(await this.platform.companies());
    } catch {
      // company filter stays empty
    }
    await this.load();
  }

  protected async load(): Promise<void> {
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
    }
  }

  protected toggle(id: number): void {
    this.expandedFor.update(cur => (cur === id ? null : id));
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
