import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ApolloService } from '../../core/services/apollo.service';
import { DIVERGENT_ORDERS, PLATFORM_CHANNELS, RECONCILE_ORDER } from '../../core/graphql/operations.graphql';
import {
  LEDGER_DIVERGENCES,
  RECONCILE_INVENTORY,
  LedgerDivergenceItem,
} from '../../core/graphql/reconciliation.operations';
import {
  DivergenceColumn,
  DivergenceTableComponent,
} from '../../shared/components/divergence-table/divergence-table.component';
import { ReconcileModalComponent } from '../../shared/components/reconcile-modal/reconcile-modal.component';

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

type ReconcileStrategy = 'ledger' | 'order' | 'note-only';
type Tab = 'orders' | 'inventory';

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function badgeClass(difference: number): string {
  return difference > 0 ? 'badge-error' : 'badge-warning';
}

@Component({
  selector: 'app-order-reconciliation',
  standalone: true,
  imports: [
    FormsModule,
    PageHeaderComponent,
    DivergenceTableComponent,
    ReconcileModalComponent,
  ],
  templateUrl: './order-reconciliation.component.html',
  styleUrl: './order-reconciliation.component.scss',
})
export class OrderReconciliationComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  activeTab = signal<Tab>('orders');

  channels = signal<PlatformChannel[]>([]);
  selectedChannelToken = signal<string>('');

  // Orders tab
  items = signal<DivergentOrder[]>([]);
  totalItems = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);
  toleranceCents = signal(1);

  selectedOrder = signal<DivergentOrder | null>(null);
  strategy = signal<ReconcileStrategy>('ledger');
  note = signal('');
  reconciling = signal(false);
  reconcileError = signal<string | null>(null);
  reconcileSuccess = signal<string | null>(null);

  readonly strategies: { value: ReconcileStrategy; label: string }[] = [
    { value: 'ledger', label: 'Trust ledger (adjust order state)' },
    { value: 'order', label: 'Trust order model (adjust ledger)' },
    { value: 'note-only', label: 'Note only' },
  ];

  readonly orderColumns: DivergenceColumn<DivergentOrder>[] = [
    { header: 'Order', value: item => item.orderCode },
    { header: 'Customer', value: item => item.customerId || '—' },
    { header: 'Order model owing', align: 'right', value: item => formatMoney(item.orderModelOwing) },
    { header: 'Ledger owing', align: 'right', value: item => formatMoney(item.ledgerOwing) },
    {
      header: 'Difference',
      align: 'right',
      value: item => formatMoney(item.difference),
      badgeClass: item => badgeClass(item.difference),
    },
    { header: 'Order total', align: 'right', value: item => formatMoney(item.orderTotal) },
  ];

  // Inventory tab
  inventoryItems = signal<LedgerDivergenceItem[]>([]);
  inventoryLoading = signal(true);
  inventoryError = signal<string | null>(null);
  inventoryToleranceCents = signal(1);

  selectedInventory = signal<LedgerDivergenceItem | null>(null);
  inventoryReason = signal('');
  inventoryReconciling = signal(false);
  inventoryReconcileError = signal<string | null>(null);
  inventoryReconcileSuccess = signal<string | null>(null);

  readonly inventoryColumns: DivergenceColumn<LedgerDivergenceItem>[] = [
    { header: 'Scope', value: item => item.descriptor },
    { header: 'Batch valuation', align: 'right', value: item => formatMoney(item.entityValue) },
    { header: 'Ledger balance', align: 'right', value: item => formatMoney(item.ledgerValue) },
    {
      header: 'Difference',
      align: 'right',
      value: item => formatMoney(item.difference),
      badgeClass: item => badgeClass(item.difference),
    },
  ];

  async ngOnInit(): Promise<void> {
    await this.loadChannels();
    await this.loadOrders();
    await this.loadInventory();
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  orderTrackBy = (item: DivergentOrder): string => item.orderId;
  inventoryTrackBy = (item: LedgerDivergenceItem): string => item.entityId;

  // Expose helpers to the template.
  formatMoney = formatMoney;

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
    this.loadOrders();
    this.loadInventory();
  }

  private channelHeaders(): Record<string, string> {
    const token = this.selectedChannelToken();
    return token ? { 'vendure-token': token } : {};
  }

  async loadOrders(): Promise<void> {
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

  async loadInventory(): Promise<void> {
    this.inventoryLoading.set(true);
    this.inventoryError.set(null);
    try {
      const result = await this.apollo.getClient().query({
        query: LEDGER_DIVERGENCES,
        variables: { toleranceCents: this.inventoryToleranceCents() },
        fetchPolicy: 'network-only',
        context: { headers: this.channelHeaders() },
      });
      const data = (result.data as { ledgerDivergences: { totalDivergences: number; items: LedgerDivergenceItem[] } }).ledgerDivergences;
      this.inventoryItems.set((data?.items ?? []).filter(i => i.entityType === 'Inventory'));
    } catch (err: unknown) {
      this.inventoryError.set(err instanceof Error ? err.message : 'Failed to load ledger divergences');
    } finally {
      this.inventoryLoading.set(false);
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
        await this.loadOrders();
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

  openInventoryReconcile(item: LedgerDivergenceItem): void {
    this.selectedInventory.set(item);
    this.inventoryReason.set('');
    this.inventoryReconcileError.set(null);
    this.inventoryReconcileSuccess.set(null);
  }

  closeInventoryReconcile(): void {
    this.selectedInventory.set(null);
  }

  async confirmInventoryReconcile(): Promise<void> {
    if (!this.selectedInventory()) return;
    this.inventoryReconciling.set(true);
    this.inventoryReconcileError.set(null);
    this.inventoryReconcileSuccess.set(null);
    try {
      const result = await this.apollo.getClient().mutate({
        mutation: RECONCILE_INVENTORY,
        variables: { reason: this.inventoryReason().trim() },
        context: { headers: this.channelHeaders() },
      });
      const variance = (result.data as { reconcileInventory?: { variance: number } })?.reconcileInventory?.variance ?? 0;
      this.inventoryReconcileSuccess.set(`Inventory reconciled. Variance closed: ${formatMoney(variance)}`);
      await this.loadInventory();
      setTimeout(() => this.closeInventoryReconcile(), 800);
    } catch (err: unknown) {
      this.inventoryReconcileError.set(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      this.inventoryReconciling.set(false);
    }
  }
}
