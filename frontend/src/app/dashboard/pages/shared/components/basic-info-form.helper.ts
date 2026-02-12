import { FormGroup } from '@angular/forms';
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
      const formattedPhone = contactPickerService.formatPhoneNumber(data.phone);
      if (formattedPhone) {
        form.patchValue({ phoneNumber: formattedPhone });
      }
      // If formatting fails, do not patch - leave field untouched so validation shows
    }
  }
}
