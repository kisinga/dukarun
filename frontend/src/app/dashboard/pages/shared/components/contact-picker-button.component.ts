import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { ContactPickerService } from '../../../../core/services/contact-picker.service';

/**
 * Contact Picker Button Component
 *
 * Reusable button for importing contacts from browser contacts API.
 */
@Component({
  selector: 'app-contact-picker-button',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isSupported()) {
      <div class="form-control">
        <button
          type="button"
          class="btn btn-outline btn-sm w-full"
          (click)="handleClick()"
          [disabled]="isImporting()"
        >
          @if (isImporting()) {
            <span class="loading loading-spinner loading-xs"></span>
            Importing...
          } @else {
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Import from Contacts
          }
        </button>
      </div>
    }
  `,
})
export class ContactPickerButtonComponent {
  private readonly contactPickerService = inject(ContactPickerService);

  readonly contactImported = output<{
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }>();
  readonly error = output<string | null>();

  readonly isImporting = signal(false);

  isSupported(): boolean {
    return this.contactPickerService.isSupported();
  }

  async handleClick(): Promise<void> {
    if (!this.isSupported()) {
      this.error.emit('Contact picker is not supported in this browser');
      return;
    }

    this.isImporting.set(true);
    this.error.emit(null);

    try {
      const contactData = await this.contactPickerService.selectContact();

      if (contactData) {
        const { firstName, lastName } = this.contactPickerService.parseName(contactData.name);

        this.contactImported.emit({
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: contactData.email || undefined,
          phone: contactData.phone || undefined,
        });
      }
    } catch (err: any) {
      console.error('Contact picker error:', err);
      this.error.emit('Failed to import contact. Please enter manually.');
    } finally {
      this.isImporting.set(false);
    }
  }
}
