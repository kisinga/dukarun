import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-customer-search-bar',
  imports: [CommonModule],
  templateUrl: './customer-search-bar.component.html',
  styleUrl: './customer-search-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerSearchBarComponent {
  @Input({ required: true }) searchQuery!: string;
  @Output() searchChange = new EventEmitter<string>();

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchChange.emit(target.value);
  }
}
