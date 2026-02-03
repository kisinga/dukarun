import { signal, type Signal } from '@angular/core';
import type { Company } from '../../models/company.model';
import { CompanyService } from '../../services/company.service';

type SignalValue<T> = T extends Signal<infer V> ? V : never;

/** Subset of CompanyService we provide in the mock; all must be Signal types for createSpyObj. */
type MockCompanyServiceStub = Pick<
  CompanyService,
  | 'companies'
  | 'activeCompanyId'
  | 'activeCompany'
  | 'companyDisplayName'
  | 'companyLogoAsset'
  | 'companyLogoUrl'
>;

/**
 * Reusable mock for CompanyService. Use when testing components that depend on
 * CompanyService but you do not need real GraphQL (e.g. layout, nav).
 * Override signals or spies as needed per test.
 */
export function createMockCompanyService(
  overrides?: Partial<{
    companies: Signal<Company[]>;
    activeCompanyId: Signal<string | null>;
    activeCompany: Signal<Company | null>;
    companyDisplayName: Signal<string>;
    companyLogoAsset: Signal<SignalValue<CompanyService['companyLogoAsset']>>;
    companyLogoUrl: Signal<SignalValue<CompanyService['companyLogoUrl']>>;
  }>,
): jasmine.SpyObj<CompanyService> {
  const stub: MockCompanyServiceStub = {
    companies: overrides?.companies ?? signal<Company[]>([]),
    activeCompanyId: overrides?.activeCompanyId ?? signal<string | null>(null),
    activeCompany: overrides?.activeCompany ?? signal<Company | null>(null),
    companyDisplayName: overrides?.companyDisplayName ?? signal('Test Company'),
    companyLogoAsset:
      overrides?.companyLogoAsset ?? signal<SignalValue<CompanyService['companyLogoAsset']>>(null),
    companyLogoUrl:
      overrides?.companyLogoUrl ?? signal<SignalValue<CompanyService['companyLogoUrl']>>(null),
  };
  const spy = jasmine.createSpyObj<CompanyService>('CompanyService', ['activateCompany'], stub);
  return spy;
}
