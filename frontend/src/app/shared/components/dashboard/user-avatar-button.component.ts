import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * User avatar button for dropdown trigger.
 * Properly structures the daisyUI avatar within a button without conflicting classes.
 * Falls back to initials when no image is available.
 */
@Component({
    selector: 'app-user-avatar-button',
    template: `
    <div tabindex="0" role="button" class="btn btn-ghost btn-circle p-0" [attr.aria-label]="ariaLabel()">
      <div class="avatar" [class.placeholder]="!imageUrl()">
        @if (imageUrl()) {
          <div class="w-10 h-10 rounded-full ring-2 ring-base-300 ring-offset-base-100 ring-offset-1">
            <img [src]="imageUrl()" [alt]="name()" class="object-cover" />
          </div>
        } @else {
          <div
            class="w-10 h-10 rounded-full bg-primary text-primary-content ring-2 ring-base-300 ring-offset-base-100 ring-offset-1 flex items-center justify-center"
          >
            <span class="text-sm font-semibold">{{ initials() }}</span>
          </div>
        }
      </div>
    </div>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatarButtonComponent {
    /** URL of the user's avatar image */
    imageUrl = input<string>('');

    /** User's display name for alt text and initials fallback */
    name = input<string>('');

    /** Accessibility label for the button */
    ariaLabel = input<string>('Open user menu');

    /** Computed initials from name for fallback display */
    initials = computed(() => {
        const fullName = this.name();
        if (!fullName) return '?';

        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 1) {
            return parts[0].charAt(0).toUpperCase();
        }
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    });
}

