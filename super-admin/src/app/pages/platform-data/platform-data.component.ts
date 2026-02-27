import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ApolloService } from '../../core/services/apollo.service';
import {
  REGISTRATION_SEED_CONTEXT,
  UPDATE_REGISTRATION_TAX_RATE,
} from '../../core/graphql/operations.graphql';

interface ZoneMember {
  id: string;
  name: string;
  code: string;
}

interface RegistrationZone {
  id: string;
  name: string;
  members: ZoneMember[];
}

interface RegistrationTaxRate {
  id: string;
  name: string;
  categoryName: string;
  value: number;
}

interface RegistrationSeedContext {
  zone: RegistrationZone;
  taxRate: RegistrationTaxRate | null;
}

@Component({
  selector: 'app-platform-data',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  templateUrl: './platform-data.component.html',
  styleUrl: './platform-data.component.scss',
})
export class PlatformDataComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  context = signal<RegistrationSeedContext | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  saving = signal(false);
  taxPercentage = signal<number>(0);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.apollo.getClient().query<{
        registrationSeedContext: RegistrationSeedContext;
      }>({
        query: REGISTRATION_SEED_CONTEXT,
        fetchPolicy: 'network-only',
      });
      const ctx = result.data?.registrationSeedContext ?? null;
      this.context.set(ctx);
      if (ctx?.taxRate != null) {
        this.taxPercentage.set(ctx.taxRate.value);
      }
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load platform data');
    } finally {
      this.loading.set(false);
    }
  }

  async updateTaxRate(): Promise<void> {
    const percentage = this.taxPercentage();
    if (percentage < 0 || percentage > 100) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_REGISTRATION_TAX_RATE,
        variables: { input: { percentage } },
      });
      await this.load();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to update tax rate');
    } finally {
      this.saving.set(false);
    }
  }
}
