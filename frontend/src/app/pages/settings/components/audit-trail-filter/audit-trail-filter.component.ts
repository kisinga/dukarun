import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'app-audit-trail-filter',
  imports: [CommonModule],
  templateUrl: './audit-trail-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditTrailFilterComponent {
  readonly searchQuery = model<string>('');
  readonly eventTypeFilter = model<string>('');
  readonly entityTypeFilter = model<string>('');
  readonly sourceFilter = model<string>('');

  readonly eventTypes = input<string[]>([]);
  readonly entityTypes = input<string[]>([]);

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }

  onEventTypeFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.eventTypeFilter.set(target.value);
  }

  onEntityTypeFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.entityTypeFilter.set(target.value);
  }

  onSourceFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.sourceFilter.set(target.value);
  }
}
