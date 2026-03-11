import { DecimalPipe } from '@angular/common';
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
  imports: [DecimalPipe, FormsModule, PageHeaderComponent],
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
    featuresJson: '',
    smsLimit: 0 as number | null,
    isActive: true,
  };

  editingTier = signal<Tier | null>(null);
  editSmsLimit = signal<number | ''>('');

  /** Full edit modal: tier being edited (null = modal closed) */
  editingTierFull = signal<Tier | null>(null);
  editFormModel = {
    code: '',
    name: '',
    description: '',
    priceMonthly: 0,
    priceYearly: 0,
    featuresJson: '',
    smsLimit: 0 as number | null,
    isActive: true,
  };

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

  /**
   * Parse features JSON. Expected shape: { "features": ["Item one", "Item two"] }
   * or { "features": [ { "text": "Item one", "included": true }, ... ] } (backend normalizes to strings).
   * Uses double quotes in JSON; single quotes are invalid.
   */
  private parseFeaturesJson(json: string): unknown {
    const t = json?.trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t) as unknown;
    } catch {
      throw new Error(
        'Invalid features JSON. Use double quotes, e.g. {"features": ["Feature one", "Feature two"]}'
      );
    }
  }

  /** Convert Sh (KES) to cents for API. */
  private shToCents(sh: number): number {
    return Math.round(Number(sh) * 100);
  }

  async create(): Promise<void> {
    this.error.set(null);
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
            priceMonthly: this.shToCents(f.priceMonthly),
            priceYearly: this.shToCents(f.priceYearly),
            features: this.parseFeaturesJson(f.featuresJson),
            smsLimit: f.smsLimit != null && f.smsLimit > 0 ? f.smsLimit : undefined,
            isActive: f.isActive,
          },
        },
      });
      this.formModel = { code: '', name: '', description: '', priceMonthly: 0, priceYearly: 0, featuresJson: '', smsLimit: 0, isActive: true };
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

  openEditTier(tier: Tier): void {
    this.error.set(null);
    this.editingTierFull.set(tier);
    // Tier prices from API are in cents; form expects Sh (KES)
    this.editFormModel = {
      code: tier.code,
      name: tier.name,
      description: tier.description ?? '',
      priceMonthly: tier.priceMonthly / 100,
      priceYearly: tier.priceYearly / 100,
      featuresJson:
        tier.features != null
          ? typeof tier.features === 'string'
            ? tier.features
            : JSON.stringify(tier.features, null, 2)
          : '',
      smsLimit: tier.smsLimit ?? 0,
      isActive: tier.isActive,
    };
  }

  cancelEditTier(): void {
    this.editingTierFull.set(null);
  }

  async saveEditTier(): Promise<void> {
    this.error.set(null);
    const tier = this.editingTierFull();
    if (!tier) return;
    const f = this.editFormModel;
    if (!f.code.trim() || !f.name.trim()) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_SUBSCRIPTION_TIER,
        variables: {
          input: {
            id: tier.id,
            code: f.code.trim(),
            name: f.name.trim(),
            description: f.description.trim() || undefined,
            priceMonthly: this.shToCents(f.priceMonthly),
            priceYearly: this.shToCents(f.priceYearly),
            features: this.parseFeaturesJson(f.featuresJson),
            smsLimit: f.smsLimit != null && f.smsLimit > 0 ? f.smsLimit : 0,
            isActive: f.isActive,
          },
        },
      });
      this.cancelEditTier();
      await this.loadTiers();
    } catch (err: any) {
      this.error.set(err?.message ?? 'Update failed');
    } finally {
      this.saving.set(false);
    }
  }
}
