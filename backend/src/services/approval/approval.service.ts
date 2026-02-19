import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventBus, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ApprovalRequest } from '../../domain/approval/approval-request.entity';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { ApprovalRequestEvent } from '../../infrastructure/events/custom-events';
import { ApprovalHandlerRegistry } from './approval-handler.registry';

export interface CreateApprovalRequestInput {
  type: string;
  metadata?: Record<string, any>;
  entityType?: string;
  entityId?: string;
  /** Optional due date for SLA/reminders */
  dueAt?: Date | string;
}

export interface ReviewApprovalRequestInput {
  id: string;
  action: 'approved' | 'rejected';
  message?: string;
  /** Structured reason when rejecting: policy | insufficient_info | other */
  rejectionReasonCode?: string;
}

export interface ApprovalRequestListOptions {
  skip?: number;
  take?: number;
  status?: string;
  type?: string;
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly eventBus: EventBus,
    private readonly approvalHandlerRegistry: ApprovalHandlerRegistry,
    @Optional() private readonly auditService?: AuditService
  ) {}

  /**
   * Create a new approval request and notify admins.
   */
  async createApprovalRequest(
    ctx: RequestContext,
    input: CreateApprovalRequestInput
  ): Promise<ApprovalRequest> {
    const userId = ctx.activeUserId;
    if (!userId) {
      throw new UserInputError('User must be authenticated to create approval requests.');
    }

    const repo = this.connection.getRepository(ctx, ApprovalRequest);
    const dueAt =
      input.dueAt != null
        ? typeof input.dueAt === 'string'
          ? new Date(input.dueAt)
          : input.dueAt
        : null;
    const request = repo.create({
      channelId: ctx.channelId as number,
      type: input.type,
      status: 'pending',
      dueAt: dueAt ?? undefined,
      requestedById: String(userId),
      metadata: input.metadata ?? {},
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    });

    const saved = await repo.save(request);
    this.logger.log(`Approval request created: ${saved.id} (type=${saved.type})`);

    // Publish event for notifications
    this.eventBus.publish(
      new ApprovalRequestEvent(
        ctx,
        String(ctx.channelId),
        saved.id,
        saved.type,
        'created',
        String(userId),
        undefined,
        { metadata: saved.metadata, entityType: saved.entityType, entityId: saved.entityId }
      )
    );

    return saved;
  }

  /**
   * Review (approve/reject) an approval request.
   * Reviewer must be different from requester.
   */
  async reviewApprovalRequest(
    ctx: RequestContext,
    input: ReviewApprovalRequestInput
  ): Promise<ApprovalRequest> {
    const reviewerId = ctx.activeUserId;
    if (!reviewerId) {
      throw new UserInputError('User must be authenticated to review approval requests.');
    }

    const repo = this.connection.getRepository(ctx, ApprovalRequest);
    const request = await repo.findOne({ where: { id: input.id } });

    if (!request) {
      throw new UserInputError(`Approval request ${input.id} not found.`);
    }

    if (request.channelId !== (ctx.channelId as number)) {
      throw new UserInputError('Approval request does not belong to this channel.');
    }

    if (request.status !== 'pending') {
      throw new UserInputError(`Approval request ${input.id} has already been ${request.status}.`);
    }

    if (String(reviewerId) === request.requestedById) {
      throw new UserInputError('You cannot review your own approval request.');
    }

    if (input.action !== 'approved' && input.action !== 'rejected') {
      throw new UserInputError('Action must be "approved" or "rejected".');
    }

    request.status = input.action;
    request.reviewedById = String(reviewerId);
    request.reviewedAt = new Date();
    request.message = input.message ?? null;
    request.rejectionReasonCode =
      input.action === 'rejected' && input.rejectionReasonCode ? input.rejectionReasonCode : null;

    const saved = await repo.save(request);
    this.logger.log(`Approval request ${saved.id} ${saved.status} by user ${reviewerId}`);

    if (this.auditService) {
      await this.auditService.log(ctx, 'approval.reviewed', {
        entityType: 'ApprovalRequest',
        entityId: saved.id,
        data: {
          approvalId: saved.id,
          type: saved.type,
          status: saved.status,
          reviewedById: String(reviewerId),
          message: saved.message ?? undefined,
          rejectionReasonCode: saved.rejectionReasonCode ?? undefined,
        },
      });
    }

    // Publish event for notifications
    this.eventBus.publish(
      new ApprovalRequestEvent(
        ctx,
        String(ctx.channelId),
        saved.id,
        saved.type,
        saved.status as 'approved' | 'rejected',
        saved.requestedById,
        String(reviewerId),
        {
          message: saved.message,
          rejectionReasonCode: saved.rejectionReasonCode ?? undefined,
          metadata: saved.metadata,
          entityType: saved.entityType,
          entityId: saved.entityId,
        }
      )
    );

    // Invoke type-specific handler when approved
    if (saved.status === 'approved') {
      await this.approvalHandlerRegistry.invokeApproved(ctx, saved);
    }

    return saved;
  }

  /**
   * List approval requests with optional filtering.
   */
  async getApprovalRequests(
    ctx: RequestContext,
    options: ApprovalRequestListOptions = {}
  ): Promise<{ items: ApprovalRequest[]; totalItems: number }> {
    const repo = this.connection.getRepository(ctx, ApprovalRequest);
    const where: any = { channelId: ctx.channelId as number };

    if (options.status) {
      where.status = options.status;
    }
    if (options.type) {
      where.type = options.type;
    }

    const [items, totalItems] = await repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: options.skip ?? 0,
      take: options.take ?? 50,
    });

    return { items, totalItems };
  }

  /**
   * Get a single approval request by ID.
   */
  async getApprovalRequest(ctx: RequestContext, id: string): Promise<ApprovalRequest | null> {
    const repo = this.connection.getRepository(ctx, ApprovalRequest);
    return repo.findOne({
      where: { id, channelId: ctx.channelId as number },
    });
  }

  /**
   * Get approval requests created by the current user.
   */
  async getMyApprovalRequests(
    ctx: RequestContext,
    options: ApprovalRequestListOptions = {}
  ): Promise<{ items: ApprovalRequest[]; totalItems: number }> {
    const userId = ctx.activeUserId;
    if (!userId) {
      return { items: [], totalItems: 0 };
    }

    const repo = this.connection.getRepository(ctx, ApprovalRequest);
    const where: any = {
      channelId: ctx.channelId as number,
      requestedById: String(userId),
    };

    if (options.status) {
      where.status = options.status;
    }
    if (options.type) {
      where.type = options.type;
    }

    const [items, totalItems] = await repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: options.skip ?? 0,
      take: options.take ?? 50,
    });

    return { items, totalItems };
  }

  /**
   * Validate that an approval exists, is approved, and matches the expected type.
   * Used by business logic (e.g., purchase flow) to verify an approval before proceeding.
   */
  async validateApproval(
    ctx: RequestContext,
    approvalId: string,
    expectedType: string
  ): Promise<ApprovalRequest> {
    const request = await this.getApprovalRequest(ctx, approvalId);

    if (!request) {
      throw new UserInputError(`Approval request ${approvalId} not found.`);
    }

    if (request.type !== expectedType) {
      throw new UserInputError(
        `Approval request ${approvalId} is for "${request.type}", expected "${expectedType}".`
      );
    }

    if (request.status !== 'approved') {
      throw new UserInputError(
        `Approval request ${approvalId} is not approved (status: ${request.status}).`
      );
    }

    return request;
  }
}
