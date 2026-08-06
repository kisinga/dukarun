import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type AvatarSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-entity-avatar',
  imports: [],
  template: `
    <div class="avatar placeholder">
      <div [class]="containerClasses()" class="flex items-center justify-center">
        <span [class]="textClasses()">{{ initials() }}</span>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityAvatarComponent {
  firstName = input<string>('');
  lastName = input<string>('');
  size = input<AvatarSize>('md');

  initials = computed(() => {
    const first = this.firstName()?.charAt(0) || '';
    const last = this.lastName()?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  });

  containerClasses = computed(() => {
    const size = this.size();
    const sizeClass = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
    return `bg-primary text-primary-content rounded-full ${sizeClass}`;
  });

  textClasses = computed(() => {
    const size = this.size();
    return size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm';
  });
}
