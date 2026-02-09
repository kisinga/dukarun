import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { Administrator } from '../../../../core/services/team.service';

@Component({
  selector: 'tr[appTeamMemberRow]',
  imports: [CommonModule],
  template: `
    <td class="align-middle">
      <div class="font-medium truncate" [title]="member.firstName + ' ' + member.lastName">
        {{ member.firstName }} {{ member.lastName }}
      </div>
    </td>
    <td class="align-middle">
      <div class="text-sm min-w-0">
        @if (member.emailAddress) {
          <div class="truncate" [title]="member.emailAddress">{{ member.emailAddress }}</div>
        }
        @if (member.user?.identifier) {
          <div class="text-base-content/70 truncate" [title]="member.user?.identifier">
            {{ member.user?.identifier }}
          </div>
        }
      </div>
    </td>
    <td class="align-middle">
      <span class="badge badge-outline">
        {{ getRoleName() }}
      </span>
    </td>
    <td class="align-middle">
      @if (member.user?.verified) {
        <span class="badge badge-success">Verified</span>
      } @else {
        <span class="badge badge-warning">Pending</span>
      }
    </td>
    <td class="align-middle text-right">
      <div class="flex gap-2 justify-end">
        <button class="btn btn-sm btn-ghost" (click)="onEdit()" title="Edit permissions">
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
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button class="btn btn-sm btn-ghost text-error" (click)="onDelete()" title="Remove">
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </td>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamMemberRowComponent {
  @Input({ required: true }) member!: Administrator;
  @Output() edit = new EventEmitter<Administrator>();
  @Output() delete = new EventEmitter<Administrator>();

  getRoleName(): string {
    const roleCode = this.member.user?.roles?.[0]?.code ?? '';
    // Extract role name from code (e.g., "channel-cashier-123" -> "Cashier")
    if (roleCode.includes('cashier')) return 'Cashier';
    if (roleCode.includes('accountant')) return 'Accountant';
    if (roleCode.includes('salesperson')) return 'Salesperson';
    if (roleCode.includes('stockkeeper')) return 'Stockkeeper';
    if (roleCode.includes('admin')) return 'Admin';
    return 'Unknown';
  }

  onEdit(): void {
    this.edit.emit(this.member);
  }

  onDelete(): void {
    this.delete.emit(this.member);
  }
}
