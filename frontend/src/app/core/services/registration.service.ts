import { Injectable, signal } from '@angular/core';
import { formatPhoneNumber, validatePhoneNumber } from '../utils/phone.utils';

export interface CompanyInfo {
  companyName: string;
  // companyCode is NOT part of this interface - backend generates it from companyName
  currency: string;
}

export interface AdminInfo {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
}

export interface StoreInfo {
  storeName: string;
  storeAddress: string;
}

export interface RegistrationData {
  company: CompanyInfo;
  admin: AdminInfo;
  store: StoreInfo;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable({
  providedIn: 'root',
})
export class RegistrationService {
  // Multi-step form state
  private readonly companyInfoSignal = signal<Partial<CompanyInfo>>({});
  private readonly adminInfoSignal = signal<Partial<AdminInfo>>({});
  private readonly storeInfoSignal = signal<Partial<StoreInfo>>({});

  // Getters
  readonly companyInfo = this.companyInfoSignal.asReadonly();
  readonly adminInfo = this.adminInfoSignal.asReadonly();
  readonly storeInfo = this.storeInfoSignal.asReadonly();

  /**
   * Set company information
   * Note: companyCode is no longer auto-generated here - backend will generate it from companyName
   */
  setCompanyInfo(info: Partial<CompanyInfo>): void {
    const current = this.companyInfoSignal();
    const updated = { ...current, ...info };
    this.companyInfoSignal.set(updated);
  }

  /**
   * Set admin information
   */
  setAdminInfo(info: Partial<AdminInfo>): void {
    const current = this.adminInfoSignal();
    let updated = { ...current, ...info };

    // Format phone number if provided
    if (info.phoneNumber) {
      updated.phoneNumber = formatPhoneNumber(info.phoneNumber);
    }

    this.adminInfoSignal.set(updated);
  }

  /**
   * Set store information
   */
  setStoreInfo(info: Partial<StoreInfo>): void {
    const current = this.storeInfoSignal();
    this.storeInfoSignal.set({ ...current, ...info });
  }

  /**
   * Validate company information
   * Note: companyCode validation removed - backend will generate it from companyName
   */
  validateCompanyInfo(data?: Partial<CompanyInfo>): ValidationResult {
    const info = data || this.companyInfoSignal();
    const errors: string[] = [];

    if (!info.companyName?.trim()) {
      errors.push('Company name is required');
    }

    if (!info.currency) {
      errors.push('Currency is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate admin information
   */
  validateAdminInfo(data?: Partial<AdminInfo>): ValidationResult {
    const info = data || this.adminInfoSignal();
    const errors: string[] = [];

    if (!info.firstName?.trim()) {
      errors.push('First name is required');
    }

    if (!info.lastName?.trim()) {
      errors.push('Last name is required');
    }

    if (!info.phoneNumber?.trim()) {
      errors.push('Phone number is required');
    } else {
      // Strict phone number validation
      const formatted = formatPhoneNumber(info.phoneNumber);
      if (!validatePhoneNumber(formatted)) {
        errors.push('Please enter a valid Kenyan phone number (e.g., 07XXXXXXXXX)');
      }
    }

    // Email is optional but if provided, should be valid
    if (info.email && info.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(info.email)) {
        errors.push('Please enter a valid email address');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate store information
   */
  validateStoreInfo(data?: Partial<StoreInfo>): ValidationResult {
    const info = data || this.storeInfoSignal();
    const errors: string[] = [];

    if (!info.storeName?.trim()) {
      errors.push('Store name is required');
    }

    if (!info.storeAddress?.trim()) {
      errors.push('Store address is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get complete registration data
   * Note: companyCode is optional - backend will generate it from companyName if not provided
   */
  getRegistrationData(): RegistrationData | null {
    const company = this.companyInfoSignal();
    const admin = this.adminInfoSignal();
    const store = this.storeInfoSignal();

    // Validate all required fields are present
    const companyValidation = this.validateCompanyInfo(company);
    const adminValidation = this.validateAdminInfo(admin);
    const storeValidation = this.validateStoreInfo(store);

    if (!companyValidation.valid || !adminValidation.valid || !storeValidation.valid) {
      return null;
    }

    // Format phone number before returning
    const formattedPhone = formatPhoneNumber(admin.phoneNumber!);

    return {
      company: {
        companyName: company.companyName!,
        // companyCode is NOT sent - backend generates it from companyName
        currency: company.currency!,
      },
      admin: {
        firstName: admin.firstName!,
        lastName: admin.lastName!,
        phoneNumber: formattedPhone,
        email: admin.email?.trim() || undefined,
      },
      store: {
        storeName: store.storeName!,
        storeAddress: store.storeAddress!.trim(),
      },
    };
  }

  /**
   * Reset all form data
   */
  reset(): void {
    this.companyInfoSignal.set({});
    this.adminInfoSignal.set({});
    this.storeInfoSignal.set({});
  }
}
