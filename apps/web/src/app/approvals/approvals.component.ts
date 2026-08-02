import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { PosService, variantLabel } from '../pos/pos.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { Approval, ApprovalsService } from './approvals.service';

type DecisionTarget = { approval: Approval; action: 'approve' | 'deny' };

const TYPE_BADGE: Record<string, string> = {
  below_wholesale: 'badge-warning',
  order_reversal: 'badge-error',
  overdraft: 'badge-info',
  customer_credit: 'badge-info',
};

@Component({
  selector: 'app-approvals',
  imports: [RouterLink, ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <app-page-header
          title="Approvals"
          backLink="/dashboard"
          backLabel="Dashboard"
          [subtitle]="approvals.pending().length + ' pending'"
        />

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        <!-- Pending inbox -->
        @if (approvals.pending().length === 0) {
          <app-empty-state
            icon="heroCheckCircle"
            title="Inbox zero"
            description="Nothing waiting for a decision. Void and below-wholesale requests land here."
          />
        } @else {
          <div class="flex flex-col gap-2">
            @for (a of approvals.pending(); track a.id) {
              <div class="card bg-base-100">
                <div class="card-body p-4">
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="badge" [class]="typeBadge(a.type)">{{ typeLabel(a.type) }}</span>
                    <span class="type-caption">by User …{{ shortId(a.requested_by) }}</span>
                    <span class="type-caption">{{ age(a.created_at) }}</span>
                    <span class="ml-auto"></span>
                    <button
                      class="btn btn-success btn-sm min-h-11"
                      [disabled]="busy()"
                      (click)="decide(a, 'approve')"
                    >
                      Approve
                    </button>
                    <button
                      class="btn btn-error btn-outline btn-sm min-h-11"
                      [disabled]="busy()"
                      (click)="decide(a, 'deny')"
                    >
                      Deny
                    </button>
                  </div>
                  <p class="mt-1 text-sm">{{ summary(a) }}</p>

                  @if (deciding(); as d) {
                    @if (d.approval.id === a.id) {
                      <form
                        (submit)="$event.preventDefault(); confirmDecision()"
                        class="mt-2 flex flex-wrap items-end gap-2 rounded-field bg-base-200 p-2"
                      >
                        <label class="form-control flex-1">
                          <span class="label-text text-xs">
                            Reason {{ d.action === 'deny' ? '(required)' : '(optional)' }}
                          </span>
                          <input
                            type="text"
                            class="input input-bordered input-sm"
                            [formControl]="decisionReason"
                          />
                        </label>
                        <button
                          type="submit"
                          class="btn btn-sm min-h-11"
                          [class.btn-success]="d.action === 'approve'"
                          [class.btn-error]="d.action === 'deny'"
                          [disabled]="
                            busy() ||
                            (d.action === 'deny' && decisionReason.value.trim().length === 0)
                          "
                        >
                          Confirm {{ d.action }}
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm"
                          (click)="deciding.set(null)"
                        >
                          Cancel
                        </button>
                      </form>
                    }
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- Decided -->
        <h2 class="type-heading mt-6">Decided</h2>
        @if (approvals.decided().length === 0) {
          <p class="mt-2 text-sm text-base-content/60">No decisions yet.</p>
        } @else {
          <div class="card mt-2 bg-base-100">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Summary</th>
                  <th>Status</th>
                  <th>Decided by</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                @for (a of approvals.decided(); track a.id) {
                  <tr>
                    <td>
                      <span class="badge badge-xs" [class]="typeBadge(a.type)">{{
                        typeLabel(a.type)
                      }}</span>
                    </td>
                    <td class="text-sm">{{ summary(a) }}</td>
                    <td>
                      <span
                        class="badge badge-xs"
                        [class.badge-success]="a.status === 'approved'"
                        [class.badge-error]="a.status === 'denied'"
                      >
                        {{ a.status }}
                      </span>
                    </td>
                    <td class="type-caption">User …{{ shortId(a.decided_by) }}</td>
                    <td class="text-xs text-base-content/60">{{ a.decision_reason ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </main>
  `,
})
export class ApprovalsComponent implements OnInit {
  protected readonly approvals = inject(ApprovalsService);
  private readonly pos = inject(PosService);

  protected readonly deciding = signal<DecisionTarget | null>(null);
  protected readonly decisionReason = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  private readonly orderCodeMap = signal<Map<string, string>>(new Map());
  private readonly variantLabelMap = signal<Map<string, string>>(new Map());

  async ngOnInit(): Promise<void> {
    await this.loadSummaries();
  }

  /** Resolve order codes + variant labels referenced by pending metadata. */
  private async loadSummaries(): Promise<void> {
    try {
      const orderIds = [
        ...new Set(
          this.approvals
            .pending()
            .map(a => (a.metadata as { order_id?: string })?.order_id)
            .filter((id): id is string => !!id)
        ),
      ];
      this.orderCodeMap.set(await this.approvals.orderCodes(orderIds));

      const variantIds = [
        ...new Set(
          this.approvals
            .pending()
            .filter(a => a.type === 'below_wholesale')
            .flatMap(a => {
              const lines = (a.metadata as { lines?: { variant_id?: string }[] })?.lines ?? [];
              return lines.map(l => l.variant_id).filter((id): id is string => !!id);
            })
        ),
      ];
      const variants = await this.pos.variantsByIds(variantIds);
      this.variantLabelMap.set(new Map(variants.map(v => [v.variant_id!, variantLabel(v)])));
    } catch {
      // summaries fall back to raw ids
    }
  }

  protected typeBadge(type: string): string {
    return TYPE_BADGE[type] ?? 'badge-outline';
  }

  protected typeLabel(type: string): string {
    return type.replace(/_/g, ' ');
  }

  protected summary(a: Approval): string {
    const meta = a.metadata as Record<string, unknown> & {
      order_id?: string;
      reason?: string;
      lines?: { variant_id: string; custom_price: number; reason?: string }[];
      ar_balance?: number;
      order_total?: number;
      credit_limit?: number;
    };
    const code = meta.order_id ? this.orderCode(meta.order_id) : null;
    switch (a.type) {
      case 'order_reversal':
        return `Void ${code ?? 'order'}${meta.reason ? ` — ${meta.reason}` : ''}`;
      case 'below_wholesale': {
        const lines = (meta.lines ?? [])
          .map(
            l =>
              `${this.variantLabelMap().get(l.variant_id) ?? l.variant_id.slice(0, 8)} at ${formatKes(l.custom_price)}`
          )
          .join(', ');
        return `Below-wholesale sale ${code ?? ''} — ${lines}`;
      }
      case 'overdraft':
        return `Credit sale ${code ?? ''} of ${formatKes(meta.order_total ?? 0)} — balance ${formatKes(meta.ar_balance ?? 0)} vs limit ${formatKes(meta.credit_limit ?? 0)}`;
      default:
        return code ?? a.type;
    }
  }

  protected decide(approval: Approval, action: 'approve' | 'deny'): void {
    this.deciding.set({ approval, action });
    this.decisionReason.setValue('');
  }

  protected async confirmDecision(): Promise<void> {
    const target = this.deciding();
    if (!target) return;
    const reason = this.decisionReason.value.trim();
    if (target.action === 'deny' && reason.length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      if (target.action === 'approve') {
        await this.approvals.approve(target.approval.id, reason || undefined);
      } else {
        await this.approvals.deny(target.approval.id, reason);
      }
      this.notice.set(`${this.typeLabel(target.approval.type)} request ${target.action}d`);
      this.deciding.set(null);
      await this.loadSummaries();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected shortId(userId: string | null): string {
    return userId ? userId.slice(-4) : '????';
  }

  protected age(iso: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  private orderCode(orderId: string): string {
    return this.orderCodeMap().get(orderId) ?? orderId.slice(0, 8);
  }
}
