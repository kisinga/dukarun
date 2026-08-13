import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { IconComponent } from '../shared/ui/icon.component';
import { ApprovalOrderContextComponent } from './approval-order-context.component';
import { Approval } from './approvals.service';

describe('ApprovalOrderContextComponent', () => {
  it('explains the reviewed automatic account split and its approval-time recheck', async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalOrderContextComponent],
      providers: [provideRouter([])],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(ApprovalOrderContextComponent);
    fixture.componentRef.setInput('approval', {
      id: 'approval-1',
      type: 'overdraft',
      status: 'pending',
      metadata: {
        automatic_customer_account: true,
        reviewed_deposit_amount: 300,
        reviewed_credit_amount: 200,
        ar_balance: 400,
        projected_balance: 600,
        credit_limit: 500,
      },
    } as unknown as Approval);
    fixture.componentRef.setInput('order', {
      id: 'order-1',
      code: 'SALE-1',
      status: 'pending_payment',
      total: 500,
    });
    fixture.componentRef.setInput('lines', []);
    fixture.componentRef.setInput('payments', []);
    fixture.componentRef.setInput('refunds', []);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Automatic account split reviewed');
    expect(text).toContain('KES 300');
    expect(text).toContain('KES 200');
    expect(text).toContain('If credit exposure increases, this request expires');
  });
});
