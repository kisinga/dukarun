import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ApolloService } from '../../core/services/apollo.service';
import { DIVERGENT_ORDERS, PLATFORM_CHANNELS, RECONCILE_ORDER } from '../../core/graphql/operations.graphql';

interface DivergentOrder {
  orderId: string;
  orderCode: string;
  customerId?: string | null;
  orderModelOwing: number;
  ledgerOwing: number;
  difference: number;
  orderTotal: number;
}

interface PlatformChannel {
  id: string;
  code: string;
  token: string;
}

type ReconcileStrategy = 'ledger' | 'order-model' | 'note-only';

@Component({
  selector: 'app-order-reconciliation',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent],
  templateUrl: './order-reconciliation.component.html',
  styleUrl: './order-reconciliation.component.scss',
})
export class OrderReconciliationComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  items = signal<DivergentOrder[]>([]);
  totalItems = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);
  toleranceCents = signal(1);

  channels = signal<PlatformChannel[]>([]);
  selectedChannelToken = signal<string>('');

  selectedOrder = signal<DivergentOrder | null>(null);
  strategy = signal<ReconcileStrategy>('ledger');
  note = signal('');
  reconciling = signal(false);
  reconcileError = signal<string | null>(null);
  reconcileSuccess = signal<string | null>(null);

  readonly strategies: { value: ReconcileStrategy; label: string }[] = [
    { value: 'ledger', label: 'Trust ledger (adjust order state)' },
    { value: 'order-model', label: 'Trust order model (flag only)' },
    { value: 'note-only', label: 'Note only' },
  ];

  async ngOnInit(): Promise<void> {
    await this.loadChannels();
    await this.load();
  }

  async loadChannels(): Promise<void> {
    try {
      const result = await this.apollo.getClient().query<{ platformChannels: PlatformChannel[] }>({
        query: PLATFORM_CHANNELS,
        fetchPolicy: 'network-only',
      });
      const loaded = result.data?.platformChannels ?? [];
      this.channels.set(loaded);
      if (loaded.length > 0) {
        this.selectedChannelToken.set(loaded[0].token);
      }
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load channels');
    }
  }

  onChannelChange(token: string): void {
    this.selectedChannelToken.set(token);
    this.load();
  }

  private channelHeaders(): Record<string, string> {
    const token = this.selectedChannelToken();
    return token ? { 'vendure-token': token } : {};
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.apollo.getClient().query<{ divergentOrders: { items: DivergentOrder[]; totalItems: number } }>({
        query: DIVERGENT_ORDERS,
        variables: { toleranceCents: this.toleranceCents() },
        fetchPolicy: 'network-only',
        context: { headers: this.channelHeaders() },
      });
      const data = result.data?.divergentOrders;
      this.items.set(data?.items ?? []);
      this.totalItems.set(data?.totalItems ?? 0);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load divergent orders');
    } finally {
      this.loading.set(false);
    }
  }

  openReconcile(order: DivergentOrder): void {
    this.selectedOrder.set(order);
    this.strategy.set('ledger');
    this.note.set('');
    this.reconcileError.set(null);
    this.reconcileSuccess.set(null);
  }

  closeReconcile(): void {
    this.selectedOrder.set(null);
  }

  async confirmReconcile(): Promise<void> {
    const order = this.selectedOrder();
    if (!order) return;
    this.reconciling.set(true);
    this.reconcileError.set(null);
    this.reconcileSuccess.set(null);
    try {
      const result = await this.apollo.getClient().mutate<{
        reconcileOrder: { orderId: string; success: boolean; message: string };
      }>({
        mutation: RECONCILE_ORDER,
        variables: {
          input: {
            orderId: order.orderId,
            strategy: this.strategy(),
            note: this.note().trim(),
          },
        },
        context: { headers: this.channelHeaders() },
      });
      const payload = result.data?.reconcileOrder;
      if (payload?.success) {
        this.reconcileSuccess.set(payload.message);
        await this.load();
        setTimeout(() => this.closeReconcile(), 800);
      } else {
        this.reconcileError.set(payload?.message ?? 'Reconciliation failed');
      }
    } catch (err: unknown) {
      this.reconcileError.set(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      this.reconciling.set(false);
    }
  }

  formatMoney(cents: number): string {
    return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  badgeClass(difference: number): string {
    return difference > 0 ? 'badge-error' : 'badge-warning';
  }
}
