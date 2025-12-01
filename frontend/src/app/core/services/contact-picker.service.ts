import { Injectable } from '@angular/core';

export interface ContactData {
  name: string;
  email: string;
  phone: string;
}

/**
 * Contact Picker Service
 *
 * Provides browser Contact Picker API integration for importing contact information.
 * Reusable across customer and supplier creation forms.
 */
@Injectable({
  providedIn: 'root',
})
export class ContactPickerService {
  private _isSupported: boolean | null = null;

  /**
   * Check if Contact Picker API is supported
   */
  isSupported(): boolean {
    if (this._isSupported === null) {
      this._isSupported = 'contacts' in navigator && 'select' in (navigator as any).contacts;
      
      // Debug message for contact picker support status
      console.log('📱 Contact Picker API Support:', {
        supported: this._isSupported,
        userAgent: navigator.userAgent,
        hasContacts: 'contacts' in navigator,
        hasSelect: 'contacts' in navigator && 'select' in (navigator as any).contacts,
      });
    }
    return this._isSupported;
  }

  /**
   * Import contact from browser contacts
   */
  async selectContact(): Promise<ContactData | null> {
    if (!this.isSupported()) {
      throw new Error('Contact picker is not supported in this browser');
    }

    try {
      const contacts = await (navigator as any).contacts.select(['name', 'email', 'tel'], {
        multiple: false,
      });

      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        return {
          name: contact.name?.[0] || '',
          email: contact.email?.[0] || '',
          phone: contact.tel?.[0] || '',
        };
      }
      return null;
    } catch (err: any) {
      // User cancelled or error occurred
      if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
        return null; // User cancelled, don't throw
      }
      throw err;
    }
  }

  /**
   * Format phone number to match validation pattern (07XXXXXXXX)
   * Handles Kenyan phone number formats
   */
  formatPhoneNumber(phone: string): string | null {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Handle Kenyan phone numbers
    // +254712345678 -> 0712345678
    // 254712345678 -> 0712345678
    // 712345678 -> 0712345678
    // 0712345678 -> 0712345678

    if (digits.startsWith('254')) {
      // Remove country code
      const withoutCountry = digits.substring(3);
      if (withoutCountry.length === 9 && withoutCountry.startsWith('7')) {
        return '0' + withoutCountry;
      }
    } else if (digits.startsWith('7') && digits.length === 9) {
      // Add leading 0
      return '0' + digits;
    } else if (digits.startsWith('0') && digits.length === 10) {
      // Already formatted
      return digits;
    }

    // If we can't format it, return null to show validation error
    return null;
  }

  /**
   * Parse contact name into first and last name
   */
  parseName(name: string): { firstName: string; lastName: string } {
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    return { firstName, lastName };
  }
}

