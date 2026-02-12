import { FormGroup } from '@angular/forms';
import { formatPhoneNumber } from '../../../../core/utils/phone.utils';
import { ContactPickerService } from '../../../../core/services/contact-picker.service';

/**
 * Shared helper functions for basic info forms
 */
export class BasicInfoFormHelper {
  /**
   * Handle contact import - shared logic for customer and supplier forms
   */
  static handleContactImport(
    form: FormGroup,
    contactPickerService: ContactPickerService,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    },
  ): void {
    if (data.firstName) {
      form.patchValue({
        businessName: data.firstName,
        contactPerson: data.lastName || data.firstName,
      });
    }

    if (data.email) {
      form.patchValue({ emailAddress: data.email });
    }

    if (data.phone) {
      try {
        form.patchValue({ phoneNumber: formatPhoneNumber(data.phone) });
      } catch {
        form.patchValue({ phoneNumber: data.phone });
      }
    }
  }
}
