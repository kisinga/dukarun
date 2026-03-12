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
  subscription_expiring_soon: p => {
    const company = String(p.company || 'your company');
    const days = p.daysRemaining ?? 'a few';
    const dayWord = days === 1 ? 'day' : 'days';
    const expiryDate = p.expiresAt
      ? new Date(String(p.expiresAt)).toLocaleDateString('en-KE', { dateStyle: 'long' })
      : null;
    const expiryLine = expiryDate ? `\nExpiry date: ${expiryDate}` : '';
    return {
      inAppTitle: 'Subscription Expiring Soon',
      inAppMessage: `${company}: subscription expires in ${days} ${dayWord}`,
      emailSubject: `Action required: ${company} subscription expires in ${days} ${dayWord}`,
      emailBody: `Hi ${company} Team,\n\nThis is a reminder that your DukaRun subscription will expire in ${days} ${dayWord}.${expiryLine}\n\nPlease renew your subscription before it expires to avoid any interruption to your service.\n\nLog in to your dashboard to manage your subscription:\nhttps://dukarun.com/dashboard/settings\n\n– The DukaRun Team`,
    };
  },
  subscription_renewed: p => ({
    inAppTitle: 'Subscription Renewed',
    inAppMessage: p.company
      ? `${p.company}: subscription renewed successfully.`
      : 'Your subscription has been renewed successfully.',
  }),
  ml_status: p => {
    const op = p.operation === 'training' ? 'Training' : 'Extraction';
    const status = String(p.status ?? '');
    const statusMap: Record<string, string> = {
      queued: 'has been queued',
      started: 'has started',
      completed: 'completed successfully',
      failed: 'failed — check the ML dashboard for details',
    };
    const titleSuffix =
      status === 'completed'
        ? 'Complete'
        : status === 'failed'
          ? 'Failed'
          : status.charAt(0).toUpperCase() + status.slice(1);
    return {
      inAppTitle: `ML ${op} ${titleSuffix}`,
      inAppMessage: `ML ${op.toLowerCase()} ${statusMap[status] ?? status}.`,
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
  customer_created: p => ({
    inAppTitle: 'New Customer',
    inAppMessage: p.customerName
      ? `${p.customerName} has been added as a customer.`
      : 'A new customer has been created.',
  }),
  credit_approved: p => {
    const limit =
      p.creditLimit != null ? ` (KES ${Number(p.creditLimit).toLocaleString('en-KE')})` : '';
    return {
      inAppTitle: 'Credit Approved',
      inAppMessage: p.customerName
        ? `Credit approved for ${p.customerName}${limit}.`
        : `Customer credit has been approved${limit}.`,
    };
  },
  balance_changed_admin: p => {
    const amount =
      p.outstandingAmount != null
        ? ` Balance: KES ${Number(p.outstandingAmount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
        : '';
    return {
      inAppTitle: 'Balance Updated',
      inAppMessage: p.customerName
        ? `${p.customerName}'s balance updated.${amount}`
        : `A customer balance has been updated.${amount}`,
    };
  },
  balance_changed: p => {
    const newBalanceCents = Number(p.newBalanceCents ?? 0);
    const formatted = formatCents(newBalanceCents);
    return {
      inAppTitle: '',
      inAppMessage: '',
      emailSubject: 'Your account balance has been updated',
      emailBody: `Your account balance has been updated.\n\nOutstanding balance: KES ${formatted}.\n\nIf you have questions about this update, please contact your supplier.`,
    };
  },
  repayment_deadline: p => {
    const amount =
      p.outstandingAmount != null
        ? ` Outstanding: KES ${Number(p.outstandingAmount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}.`
        : '';
    const reason = p.exceedsThreshold ? 'Credit limit nearly reached.' : 'Repayment due soon.';
    return {
      inAppTitle: 'Repayment Reminder',
      inAppMessage: p.customerName
        ? `${p.customerName}: ${reason}${amount}`
        : `Customer repayment deadline.${amount}`,
    };
  },
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
    inAppMessage: (p.productName as string)
      ? `${p.productName} is running low on stock.`
      : (p.message as string) || `Product ${p.productId} is running low on stock`,
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
  shift_opened: p => {
    const time = p.openedAt
      ? new Date(String(p.openedAt)).toLocaleTimeString('en-KE', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;
    return {
      inAppTitle: 'Shift Opened',
      inAppMessage: time ? `Shift opened at ${time}.` : 'A new shift has been opened.',
    };
  },
  shift_closed: p => {
    const time = p.closedAt
      ? new Date(String(p.closedAt)).toLocaleTimeString('en-KE', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;
    const varianceCents = Number(p.variance ?? 0);
    const varianceText =
      varianceCents !== 0
        ? ` Variance: KES ${(Math.abs(varianceCents) / 100).toFixed(2)}${varianceCents < 0 ? ' short' : ' over'}.`
        : '';
    return {
      inAppTitle: 'Shift Closed',
      inAppMessage: time
        ? `Shift closed at ${time}.${varianceText}`
        : `Shift has been closed.${varianceText}`,
    };
  },
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
