import { AfterViewInit, computed, Directive, inject, signal, WritableSignal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApprovalService } from '../../../../core/services/approval.service';

/**
 * ApprovableFormBase - Base directive for forms that participate in the approval workflow.
 *
 * Provides:
 * - Field registry for automatic state save/restore
 * - Approval-aware restoration from query params (?approvalId=xxx)
 * - Rejection message display (pinned banner)
 * - Computed formValid signal
 *
 * Usage:
 *   1. Extend this directive in your form component
 *   2. Call registerField('name', signal) for each stateful field
 *   3. Implement isValid(): boolean
 *   4. Use rejectionMessage() in template for the pinned banner
 *   5. Call serializeFormState() when creating approval requests
 *
 * For components with FormGroup-based children, override
 * serializeFormState() and restoreFormState() to handle custom serialization.
 */
@Directive()
export abstract class ApprovableFormBase implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly approvalService = inject(ApprovalService);
  private readonly fieldRegistry = new Map<string, WritableSignal<any>>();

  /** Rejection message from a rejected approval (pinned at top of form). */
  readonly rejectionMessage = signal<string | null>(null);

  /** ID of the approval this form was restored from. */
  readonly approvalId = signal<string | null>(null);

  /** Status of the linked approval. */
  readonly approvalStatus = signal<'none' | 'approved' | 'rejected'>('none');

  /** Computed validity state. Child must implement isValid(). */
  readonly formValid = computed(() => this.isValid());

  /**
   * Register a signal-backed field for automatic save/restore.
   * Call in constructor or ngOnInit of the implementing component.
   */
  protected registerField(name: string, ref: WritableSignal<any>): void {
    this.fieldRegistry.set(name, ref);
  }

  /**
   * Serialize all registered fields to a plain object.
   * Override in child for custom serialization (e.g., FormGroup values).
   */
  serializeFormState(): Record<string, any> {
    const state: Record<string, any> = {};
    for (const [name, sig] of this.fieldRegistry) {
      state[name] = sig();
    }
    return state;
  }

  /**
   * Restore all registered fields from a plain object.
   * Override in child for custom deserialization (e.g., patching FormGroup).
   */
  restoreFormState(data: Record<string, any>): void {
    for (const [name, value] of Object.entries(data)) {
      const field = this.fieldRegistry.get(name);
      if (field) {
        field.set(value);
      }
    }
  }

  /**
   * After view init: check for approval restoration via query param.
   * If extending component also uses ngAfterViewInit, call super.ngAfterViewInit().
   */
  ngAfterViewInit(): void {
    const id = this.route.snapshot.queryParamMap.get('approvalId');
    if (id) {
      this.restoreFromApproval(id);
    }
  }

  /** Dismiss the rejection message banner. */
  dismissRejection(): void {
    this.rejectionMessage.set(null);
  }

  /** Child must implement: is the form currently valid? */
  abstract isValid(): boolean;

  private async restoreFromApproval(id: string): Promise<void> {
    try {
      const approval = await this.approvalService.getApproval(id);
      if (!approval) return;

      this.approvalId.set(id);
      this.approvalStatus.set(approval.status as 'approved' | 'rejected');

      if (approval.status === 'rejected' && approval.message) {
        this.rejectionMessage.set(approval.message);
      }

      if (approval.metadata?.formState) {
        // Use requestAnimationFrame to ensure child views are ready
        requestAnimationFrame(() => {
          this.restoreFormState(approval.metadata.formState);
        });
      }
    } catch (err) {
      console.error('Failed to restore from approval:', err);
    }
  }
}
