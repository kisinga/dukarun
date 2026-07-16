import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-transfers-placeholder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './transfers-placeholder.component.html',
  styleUrl: './transfers-placeholder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransfersPlaceholderComponent {}
