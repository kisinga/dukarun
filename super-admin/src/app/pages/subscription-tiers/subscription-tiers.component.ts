import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApolloService } from '../../core/services/apollo.service';
import {
  GET_SUBSCRIPTION_TIERS,
  CREATE_SUBSCRIPTION_TIER,
  UPDATE_SUBSCRIPTION_TIER,
  DEACTIVATE_SUBSCRIPTION_TIER,
} from '../../core/graphql/operations.graphql';
import { PageHeaderComponent } from '../../shared/components/page-header';

interface Tier {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  features: unknown;
  smsLimit: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-subscription-tiers',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent],
  templateUrl: './subscription-tiers.component.html',
  styleUrl: './subscription-tiers.component.scss',
})
export class SubscriptionTiersComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  tiers = signal<Tier[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  saving = signal(false);

  formModel = {
    code: '',
    name: '',
    description: '',
    priceMonthly: 0,
    priceYearly: 0,
    smsLimit: 0 as number | null,
    isActive: true,
  };

  editingTier = signal<Tier | null>(null);
  editSmsLimit = signal<number | ''>('');

  async ngOnInit(): Promise<void> {
    await this.loadTiers();
  }

  async loadTiers(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.apollo.getClient().query<{ getSubscriptionTiers: Tier[] }>({
        query: GET_SUBSCRIPTION_TIERS,
        fetchPolicy: 'network-only',
      });
      this.tiers.set(result.data?.getSubscriptionTiers ?? []);
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load tiers');
    } finally {
      this.loading.set(false);
    }
  }

  async create(): Promise<void> {
    const f = this.formModel;
    if (!f.code.trim() || !f.name.trim()) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: CREATE_SUBSCRIPTION_TIER,
        variables: {
          input: {
            code: f.code.trim(),
            name: f.name.trim(),
            description: f.description.trim() || undefined,
            priceMonthly: f.priceMonthly,
            priceYearly: f.priceYearly,
            smsLimit: f.smsLimit != null && f.smsLimit > 0 ? f.smsLimit : undefined,
            isActive: f.isActive,
          },
        },
      });
      this.formModel = { code: '', name: '', description: '', priceMonthly: 0, priceYearly: 0, smsLimit: 0, isActive: true };
      await this.loadTiers();
    } catch (err: any) {
      this.error.set(err?.message ?? 'Create failed');
    } finally {
      this.saving.set(false);
    }
  }

  async deactivate(id: string): Promise<void> {
    if (!confirm('Deactivate this tier?')) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: DEACTIVATE_SUBSCRIPTION_TIER,
        variables: { id },
      });
      await this.loadTiers();
    } finally {
      this.saving.set(false);
    }
  }

  openEditSmsLimit(tier: Tier): void {
    this.editingTier.set(tier);
    this.editSmsLimit.set(tier.smsLimit ?? '');
  }

  cancelEdit(): void {
    this.editingTier.set(null);
    this.editSmsLimit.set('');
  }

  async saveEditSmsLimit(): Promise<void> {
    const tier = this.editingTier();
    const val = this.editSmsLimit();
    if (!tier) return;
    const smsLimit = val === '' ? null : Number(val);
    if (smsLimit !== null && (isNaN(smsLimit) || smsLimit < 0)) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_SUBSCRIPTION_TIER,
        variables: {
          input: {
            id: tier.id,
            smsLimit: smsLimit ?? 0,
          },
        },
      });
      this.cancelEdit();
      await this.loadTiers();
    } catch (err: any) {
      this.error.set(err?.message ?? 'Update failed');
    } finally {
      this.saving.set(false);
    }
  }
}
