import { Injectable, inject } from '@angular/core';
import { PermissionsService } from './permissions.service';

export type ActionOutcome =
  | { status: 'completed'; resource_id: string; subject_id: string }
  | { status: 'approval_required'; approval_id: string; subject_id: string };

/** Normalizes action RPC results and refreshes access after a server denial. */
@Injectable({ providedIn: 'root' })
export class ActionExecutorService {
  private readonly permissions = inject(PermissionsService);

  async run(operation: () => Promise<unknown>): Promise<ActionOutcome> {
    try {
      const value = await operation();
      if (!this.isOutcome(value)) throw new Error('Unexpected action response');
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('permission_denied')) await this.permissions.refresh();
      throw error;
    }
  }

  private isOutcome(value: unknown): value is ActionOutcome {
    if (!value || typeof value !== 'object') return false;
    const outcome = value as Partial<ActionOutcome>;
    if (typeof outcome.subject_id !== 'string') return false;
    return (
      (outcome.status === 'completed' && typeof outcome.resource_id === 'string') ||
      (outcome.status === 'approval_required' && typeof outcome.approval_id === 'string')
    );
  }
}
