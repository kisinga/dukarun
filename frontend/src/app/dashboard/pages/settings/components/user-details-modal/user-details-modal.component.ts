import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  viewChild,
} from '@angular/core';
import { UsersService } from '../../../../../core/services/users.service';

@Component({
  selector: 'app-user-details-modal',
  imports: [CommonModule],
  templateUrl: './user-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDetailsModalComponent implements OnInit {
  readonly usersService = inject(UsersService);

  readonly userId = input<string | null>(null);
  readonly source = input<'user_action' | 'system_event'>('system_event');
  readonly closed = output<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  readonly currentUserId = computed(() => this.userId());
  readonly currentSource = computed(() => this.source());
  readonly user = this.usersService.currentUser;
  readonly isLoading = this.usersService.isLoading;
  readonly error = this.usersService.error;

  readonly fullName = computed(() => {
    const user = this.user();
    if (!user) return 'Unknown User';
    return `${user.firstName} ${user.lastName}`.trim() || 'Unknown User';
  });

  readonly initials = computed(() => {
    const user = this.user();
    if (!user) return '?';
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    return (firstName || lastName || user.id).charAt(0).toUpperCase();
  });

  constructor() {
    effect(() => {
      const id = this.userId();
      if (id) {
        this.usersService.fetchAdministratorByUserId(id);
      } else {
        this.usersService.clearCurrentUser();
      }
    });

    effect(() => {
      const id = this.userId();
      const modal = this.modalRef()?.nativeElement;
      if (!modal) return;

      if (id) {
        modal.showModal();
      } else {
        modal.close();
      }
    });
  }

  ngOnInit(): void {
    const id = this.userId();
    if (id) {
      this.usersService.fetchAdministratorByUserId(id);
    }
  }

  open(): void {
    this.modalRef()?.nativeElement?.showModal();
  }

  close(): void {
    this.modalRef()?.nativeElement?.close();
    this.usersService.clearError();
    this.closed.emit();
  }

  getInitials(): string {
    const id = this.currentUserId();
    return id ? id.charAt(0).toUpperCase() : '?';
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getChannelNames(channels: Array<{ id: string; code: string; token: string }>): string {
    return channels.map((c) => c.code).join(', ');
  }
}
