/**
 * Renders message content for outbound delivery by trigger key.
 * Payload shape is trigger-specific; render functions read what they need.
 */
export interface RenderedOutbound {
  inAppTitle: string;
  inAppMessage: string;
  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

type RenderFn = (payload: Record<string, unknown>) => RenderedOutbound;

const RENDERERS: Record<string, RenderFn> = {
  order_payment_settled: p => ({
    inAppTitle: 'Payment Received',
    inAppMessage: `Order #${p.orderCode} payment has been settled`,
  }),
  order_fulfilled: p => ({
    inAppTitle: 'Order Fulfilled',
    inAppMessage: `Order #${p.orderCode} has been fulfilled`,
  }),
  order_cancelled: p => ({
    inAppTitle: 'Order Cancelled',
    inAppMessage: `Order #${p.orderCode} has been cancelled`,
  }),
  subscription_expiring_soon: p => ({
    inAppTitle: 'Subscription Expiring Soon',
    inAppMessage: `Your subscription expires in ${p.daysRemaining ?? 'a few'} days`,
  }),
  subscription_expired: () => ({
    inAppTitle: 'Subscription Expired',
    inAppMessage: 'Your subscription has expired. Please renew to continue.',
  }),
  subscription_renewed: () => ({
    inAppTitle: 'Subscription Renewed',
    inAppMessage: 'Your subscription has been renewed successfully.',
  }),
  ml_status: p => {
    const op = p.operation === 'training' ? 'Training' : 'Extraction';
    const statusMap: Record<string, string> = {
      queued: 'queued',
      started: 'started',
      completed: 'completed successfully',
      failed: 'failed',
    };
    const status = String(p.status ?? '');
    return {
      inAppTitle: `ML ${op} ${status === 'completed' ? 'Complete' : status.charAt(0).toUpperCase() + status.slice(1)}`,
      inAppMessage: `ML ${(op as string).toLowerCase()} has ${statusMap[status] ?? status}`,
    };
  },
  admin_action: p => {
    const entity = String(p.entity ?? 'entity');
    const action = String(p.action ?? 'updated');
    const entityName = entity.charAt(0).toUpperCase() + entity.slice(1);
    return {
      inAppTitle: `${entityName} ${action}`,
      inAppMessage: `A ${entity} has been ${action}`,
    };
  },
  customer_created: () => ({
    inAppTitle: 'New Customer',
    inAppMessage: 'A new customer has been created.',
  }),
  credit_approved: () => ({
    inAppTitle: 'Credit Approved',
    inAppMessage: 'Customer credit has been approved.',
  }),
  balance_changed_admin: () => ({
    inAppTitle: 'Balance Updated',
    inAppMessage: 'A customer balance has been updated.',
  }),
  balance_changed: p => {
    const newBalanceCents = Number(p.newBalanceCents ?? 0);
    const formatted = formatCents(newBalanceCents);
    return {
      inAppTitle: '',
      inAppMessage: '',
      smsBody: `Your account balance has been updated. Outstanding balance: KES ${formatted}.`,
    };
  },
  repayment_deadline: () => ({
    inAppTitle: 'Repayment Reminder',
    inAppMessage: 'Customer repayment deadline reminder.',
  }),
  channel_approved: () => ({
    inAppTitle: 'Channel Approved',
    inAppMessage: 'Your channel status has been updated.',
  }),
  channel_status_changed: p => ({
    inAppTitle: 'Channel Status Changed',
    inAppMessage: (p.message as string) || 'Your channel status has been updated',
  }),
  stock_low: p => ({
    inAppTitle: 'Low Stock Alert',
    inAppMessage: (p.message as string) || `Product ${p.productId} is running low on stock`,
  }),
  company_registered: p => {
    const details = p as {
      companyName?: string;
      companyCode?: string;
      storeName?: string;
      adminName?: string;
      adminPhone?: string;
      adminEmail?: string;
      channelId?: string;
    };
    const timestamp = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
    const emailBody = `
New Company Registration Alert

A new company has registered on DukaRun and requires approval.

Company Details:
- Company Name: ${details.companyName}
- Company Code: ${details.companyCode}
- Store Name: ${details.storeName}

Administrator Details:
- Name: ${details.adminName}
- Phone: ${details.adminPhone}
- Email: ${details.adminEmail ?? 'Not provided'}

Registration Time: ${timestamp}
Channel ID: ${details.channelId}

Please log in to the admin panel to review and approve this registration.
    `.trim();
    return {
      inAppTitle: '',
      inAppMessage: '',
      smsBody: `DukaRun: New company "${details.companyName}" registered. Admin: ${details.adminName} (${details.adminPhone}). Please review and approve.`,
      emailSubject: `New Company Registration: ${details.companyName}`,
      emailBody,
    };
  },
  approval_created: p => {
    const typeLabels: Record<string, string> = {
      overdraft: 'Overdraft',
      customer_credit: 'Customer Credit',
      below_wholesale: 'Below Wholesale Price',
      order_reversal: 'Order Reversal',
    };
    const typeLabel = typeLabels[String(p.approvalType)] ?? String(p.approvalType);
    return {
      inAppTitle: `${typeLabel} Approval Needed`,
      inAppMessage: `A ${typeLabel.toLowerCase()} approval has been requested. Review it on the Approvals page.`,
    };
  },
  approval_resolved: p => {
    const typeLabels: Record<string, string> = {
      overdraft: 'Overdraft',
      customer_credit: 'Customer Credit',
      below_wholesale: 'Below Wholesale Price',
      order_reversal: 'Order Reversal',
    };
    const typeLabel = typeLabels[String(p.approvalType)] ?? String(p.approvalType);
    const action = String(p.action);
    const statusLabel = action === 'approved' ? 'approved' : 'rejected';
    const reasonCode = p.rejectionReasonCode as string | undefined;
    const reasonLabel =
      reasonCode &&
      (
        {
          policy: 'Policy',
          insufficient_info: 'Insufficient information',
          other: 'Other',
        } as Record<string, string>
      )[reasonCode];
    const reasonPrefix = reasonLabel ? ` (${reasonLabel})` : '';
    const message = (p.message as string)
      ? `Your ${typeLabel.toLowerCase()} request was ${statusLabel}${reasonPrefix}: ${p.message}`
      : `Your ${typeLabel.toLowerCase()} request was ${statusLabel}${reasonPrefix}.`;
    return {
      inAppTitle: `${typeLabel} Request ${action === 'approved' ? 'Approved' : 'Rejected'}`,
      inAppMessage: message,
    };
  },
  shift_opened: p => ({
    inAppTitle: 'Shift Opened',
    inAppMessage: `Cashier session ${p.sessionId ?? 'session'} opened.`,
  }),
  shift_closed: p => ({
    inAppTitle: 'Shift Closed',
    inAppMessage: `Cashier session ${p.sessionId ?? 'session'} has been closed.`,
  }),
};

/**
 * Render message content for a trigger. Returns default placeholder if no renderer.
 */
export function renderOutbound(
  triggerKey: string,
  payload: Record<string, unknown>
): RenderedOutbound {
  const fn = RENDERERS[triggerKey];
  if (fn) return fn(payload);
  return {
    inAppTitle: 'Notification',
    inAppMessage: (payload.message as string) || `Event: ${triggerKey}`,
  };
}
