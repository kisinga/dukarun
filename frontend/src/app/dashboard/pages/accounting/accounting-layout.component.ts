import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

const ACCOUNTING_TABS: { path: string; label: string }[] = [
  { path: 'ledger', label: 'Ledger' },
  { path: 'expenses', label: 'Expenses' },
  { path: 'transfers', label: 'Inter-account transfers' },
];

@Component({
  selector: 'app-accounting-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './accounting-layout.component.html',
  styleUrl: './accounting-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingLayoutComponent {
  protected readonly tabs = ACCOUNTING_TABS;
}
