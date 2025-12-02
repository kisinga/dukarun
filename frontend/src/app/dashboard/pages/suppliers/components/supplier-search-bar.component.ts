import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-supplier-search-bar',
  imports: [CommonModule],
  templateUrl: './supplier-search-bar.component.html',
  styleUrl: './supplier-search-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierSearchBarComponent {
  @Input({ required: true }) searchQuery!: string;
  @Output() searchChange = new EventEmitter<string>();

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchChange.emit(target.value);
  }
}
