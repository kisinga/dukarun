import { Component, computed, input } from '@angular/core';

type AvatarSize = 'sm' | 'md' | 'lg';

/** Initials avatar for customers/team rows (ported from the old app).
 *  Renders the photo when `imageUrl` is set, initials otherwise. */
@Component({
  selector: 'app-entity-avatar',
  template: `
    <div class="avatar" [class.placeholder]="!imageUrl()">
      @if (imageUrl(); as url) {
        <div [class]="containerClasses()" class="overflow-hidden">
          <img [src]="url" alt="" class="h-full w-full object-cover" />
        </div>
      } @else {
        <div [class]="containerClasses()" class="flex items-center justify-center">
          <span [class]="textClasses()">{{ initials() }}</span>
        </div>
      }
    </div>
  `,
})
export class EntityAvatarComponent {
  readonly firstName = input<string>('');
  readonly lastName = input<string>('');
  readonly size = input<AvatarSize>('md');
  readonly imageUrl = input<string | null>(null);

  protected readonly initials = computed(() => {
    const first = this.firstName()?.charAt(0) || '';
    const last = this.lastName()?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  });

  protected readonly containerClasses = computed(() => {
    const size = this.size();
    const sizeClass = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
    return `bg-primary text-primary-content rounded-full ${sizeClass}`;
  });

  protected readonly textClasses = computed(() => {
    const size = this.size();
    return size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm';
  });
}
