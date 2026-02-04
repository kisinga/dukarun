import { signal } from '@angular/core';
import { CompanyService } from '../../services/company.service';

/**
 * Reusable mock for CompanyService. Use when testing components that depend on
 * CompanyService but you do not need real GraphQL (e.g. layout, nav).
 * Override signals or spies as needed per test.
 */
export function createMockCompanyService(
  overrides?: Partial<{
    companies: ReturnType<CompanyService['companies']>;
    activeCompanyId: ReturnType<CompanyService['activeCompanyId']>;
    activeCompany: ReturnType<CompanyService['activeCompany']>;
    companyDisplayName: ReturnType<CompanyService['companyDisplayName']>;
    companyLogoAsset: ReturnType<CompanyService['companyLogoAsset']>;
    companyLogoUrl: ReturnType<CompanyService['companyLogoUrl']>;
  }>,
): jasmine.SpyObj<CompanyService> {
  const spy = jasmine.createSpyObj<CompanyService>('CompanyService', ['activateCompany'], {
    companies: overrides?.companies ?? signal([]),
    activeCompanyId: overrides?.activeCompanyId ?? signal(null),
    activeCompany: overrides?.activeCompany ?? signal(null),
    companyDisplayName: overrides?.companyDisplayName ?? signal('Test Company'),
    companyLogoAsset: overrides?.companyLogoAsset ?? signal(null),
    companyLogoUrl: overrides?.companyLogoUrl ?? signal(null),
  });
  return spy;
}
