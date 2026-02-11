# Approval System

Composable approval workflow for actions requiring oversight.

## Architecture

```
Backend:  ApprovalPlugin → ApprovalService → ApprovalRequestEvent → NotificationSubscriber
Frontend: ApprovalService → ApprovableFormBase → Component
```

**Flow**: User action triggers error → Component catches it → Creates approval request → Admin notified → Admin approves/rejects → Author notified → Author resumes form with `?approvalId=xxx`.

## Approval Types

| Type | Trigger | Metadata |
|------|---------|----------|
| `overdraft` | Payment exceeds account balance | `accountCode`, `requiredAmount`, `formState` |
| `customer_credit` | Credit limit change requires review | `customerId`, `creditLimit`, `formState` |
| `below_wholesale` | Selling below wholesale price | `orderId`, `variantId`, `price`, `wholesalePrice` |
| `order_reversal` | Reversing a completed order | `orderId`, `reason`, `amount` |

## Adding a New Approval Type

### 1. Backend: Trigger the approval

In your service, throw a `UserInputError` with a recognizable message when the condition is met. The frontend catches this and offers the user an approval request option.

```typescript
// In your service method:
if (needsApproval) {
  throw new UserInputError(
    'Action requires approval. Available: X, Required: Y.',
    { code: 'YOUR_ERROR_CODE' } as any
  );
}

// When an approval is provided:
if (input.approvalId && this.approvalService) {
  await this.approvalService.validateApproval(ctx, input.approvalId, 'your_type');
}
```

### 2. Backend: Handle approval in notification subscriber

In `notification.subscriber.ts`, add your type's route to `getApprovalSourceRoute()`:

```typescript
private getApprovalSourceRoute(type: string): string {
  const routes: Record<string, string> = {
    overdraft: '/dashboard/purchases/create',
    your_type: '/dashboard/your-page',
  };
  return routes[type] || '/dashboard/approvals';
}
```

### 3. Frontend: Catch the error and create request

```typescript
try {
  await this.myService.doAction();
} catch (error: any) {
  if (error.message.includes('requires approval')) {
    await this.approvalService.createApprovalRequest({
      type: 'your_type',
      metadata: {
        formState: this.serializeFormState(),
        // ... type-specific data
      },
      entityType: 'your_entity',
    });
  }
}
```

## Making a Form Approvable

### 1. Extend `ApprovableFormBase`

```typescript
import { ApprovableFormBase } from '../shared/directives/approvable-form-base.directive';

@Component({ ... })
export class MyFormComponent extends ApprovableFormBase implements AfterViewInit {

  override ngAfterViewInit(): void {
    super.ngAfterViewInit(); // Checks ?approvalId query param
  }

  override isValid(): boolean {
    return this.myForm.valid;
  }

  override serializeFormState(): Record<string, any> {
    return { field1: this.field1(), field2: this.field2() };
  }

  override restoreFormState(data: Record<string, any>): void {
    if (data['field1']) this.field1.set(data['field1']);
    if (data['field2']) this.field2.set(data['field2']);
  }
}
```

### 2. Add rejection banner to template

```html
<app-rejection-banner [message]="rejectionMessage()" (dismiss)="dismissRejection()" />

@if (approvalStatus() === 'approved') {
  <div class="alert alert-success text-sm">Approved. You may proceed.</div>
}
```

### 3. Include `approvalId` when submitting

```typescript
if (this.approvalId() && this.approvalStatus() === 'approved') {
  input.approvalId = this.approvalId();
}
```

## Signal-based Field Registry (Alternative)

For simple signal-backed forms, use `registerField()` instead of overriding serialize/restore:

```typescript
constructor() {
  this.registerField('name', this.name);
  this.registerField('amount', this.amount);
}
// serializeFormState() and restoreFormState() auto-handle registered fields.
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/plugins/approval/approval.plugin.ts` | Plugin, resolver, GQL schema |
| `backend/src/services/approval/approval.service.ts` | Core approval logic |
| `backend/src/domain/approval/approval-request.entity.ts` | Entity |
| `frontend/src/app/core/services/approval.service.ts` | Frontend API service |
| `frontend/src/app/dashboard/pages/approvals/approvals.component.ts` | Approvals list page |
| `frontend/src/app/dashboard/pages/shared/directives/approvable-form-base.directive.ts` | Form base directive |
| `frontend/src/app/dashboard/pages/shared/components/rejection-banner.component.ts` | Rejection banner |
