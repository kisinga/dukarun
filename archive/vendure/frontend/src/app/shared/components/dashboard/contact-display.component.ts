import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type ContactPreference = 'email' | 'phone';

@Component({
  selector: 'app-contact-display',
  imports: [],
  template: `
    <div class="text-sm">
      {{ displayContact() }}
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactDisplayComponent {
  email = input<string>('');
  phone = input<string>('');
  preference = input<ContactPreference>('email');

  displayContact = computed(() => {
    const pref = this.preference();
    const email = this.email();
    const phone = this.phone();

    if (pref === 'email') {
      return email || phone || '—';
    } else {
      return phone || email || '—';
    }
  });
}
