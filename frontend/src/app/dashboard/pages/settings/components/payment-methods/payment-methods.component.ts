import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LanguageCode } from '../../../../../core/graphql/generated/graphql';
import { GET_PAYMENT_METHODS } from '../../../../../core/graphql/operations.graphql';
import type { GetPaymentMethodsQuery } from '../../../../../core/graphql/generated/graphql';
import { ApolloService } from '../../../../../core/services/apollo.service';
import { CompanyService } from '../../../../../core/services/company.service';
import {
  CreatePaymentMethodInput,
  PaymentMethod,
  SettingsService,
  UpdatePaymentMethodInput,
} from '../../../../../core/services/settings.service';

@Component({
  selector: 'app-payment-methods',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './payment-methods.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentMethodsComponent {
  readonly settingsService = inject(SettingsService);
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);
  private readonly fb = inject(FormBuilder);

  private readonly paymentMethodsSignal = signal<PaymentMethod[]>([]);
  readonly paymentMethods = this.paymentMethodsSignal.asReadonly();
  readonly showModal = signal(false);
  readonly isEditing = signal(false);
  readonly paymentMethodForm: FormGroup;

  private editingMethod: PaymentMethod | null = null;
  private currentFetchChannelId: string | null = null;

  constructor() {
    this.paymentMethodForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      code: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      isActive: [true],
    });

    effect(() => {
      const channel = this.companyService.activeChannel();
      if (!channel) {
        this.paymentMethodsSignal.set([]);
        return;
      }
      void this.loadPaymentMethods(channel.id);
    });
  }

  isDefaultMethod(code: string): boolean {
    return code === 'marki-cash' || code === 'marki-mpesa';
  }

  openCreateModal(): void {
    this.isEditing.set(false);
    this.editingMethod = null;
    this.paymentMethodForm.reset({ isActive: true });
    this.showModal.set(true);
  }

  editMethod(method: PaymentMethod): void {
    this.isEditing.set(true);
    this.editingMethod = method;
    this.paymentMethodForm.patchValue({
      name: method.name,
      code: method.code,
      description: method.description || '',
      isActive: method.customFields?.isActive ?? true,
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.isEditing.set(false);
    this.editingMethod = null;
    this.paymentMethodForm.reset();
  }

  async submitForm(): Promise<void> {
    if (this.paymentMethodForm.invalid) return;

    const formValue = this.paymentMethodForm.value;
    const channelId = this.companyService.activeChannel()?.id;

    if (this.isEditing() && this.editingMethod) {
      const input: UpdatePaymentMethodInput = {
        id: this.editingMethod.id,
        name: formValue.name,
        description: formValue.description,
        isActive: formValue.isActive,
      };
      await this.settingsService.updatePaymentMethod(input);
    } else {
      const input: CreatePaymentMethodInput = {
        name: formValue.name,
        code: formValue.code,
        description: formValue.description,
        enabled: true,
        handler: { code: 'manual-payment-handler', arguments: [] },
        translations: [
          {
            languageCode: LanguageCode.en,
            name: formValue.name,
            description: formValue.description,
          },
        ],
      };
      await this.settingsService.createPaymentMethod(input);
    }

    if (!this.settingsService.error()) {
      if (channelId) await this.loadPaymentMethods(channelId);
      this.closeModal();
    }
  }

  async toggleMethodStatus(method: PaymentMethod, event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    if (this.isDefaultMethod(method.code)) return;

    const input: UpdatePaymentMethodInput = {
      id: method.id,
      isActive: target.checked,
    };

    await this.settingsService.updatePaymentMethod(input);

    const channel = this.companyService.activeChannel();
    if (channel) await this.loadPaymentMethods(channel.id);
  }

  async deleteMethod(method: PaymentMethod): Promise<void> {
    console.log('Delete payment method:', method.name);
  }

  private async loadPaymentMethods(channelId: string): Promise<void> {
    this.currentFetchChannelId = channelId;
    this.settingsService.loading.set(true);
    this.settingsService.clearError();

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<GetPaymentMethodsQuery>({
        query: GET_PAYMENT_METHODS,
        fetchPolicy: 'network-only',
      });

      const methods = result.data?.paymentMethods.items ?? [];

      if (this.currentFetchChannelId === channelId) {
        const normalized: PaymentMethod[] = methods.map((method) => ({
          id: method.id,
          code: method.code,
          name: method.name,
          description: method.description,
          enabled: method.enabled,
          customFields: method.customFields
            ? {
                imageAsset: method.customFields.imageAsset
                  ? {
                      id: method.customFields.imageAsset.id,
                      preview: method.customFields.imageAsset.preview,
                    }
                  : null,
                isActive: method.customFields.isActive ?? null,
              }
            : null,
        }));
        this.paymentMethodsSignal.set(normalized);
      }
    } catch (error) {
      console.error('Failed to load payment methods:', error);
      this.settingsService.error.set('Failed to load payment methods');
    } finally {
      this.settingsService.loading.set(false);
    }
  }
}
