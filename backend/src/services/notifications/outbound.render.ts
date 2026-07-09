/**
 * Renders message content for outbound delivery by trigger key.
 * Payload shape is trigger-specific; render functions read what they need.
 */
export interface RenderedOutbound {
  inAppTitle: string;
  inAppMessage: string;
  smsBody?: string;
  whatsappBody?: string;
  emailSubject?: string;
  emailBody?: string;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatCentsKes(cents: number): string {
  return `KES ${Number(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getVarianceEmoji(varianceCents: number, thresholdCents: number): string {
  if (varianceCents === 0) return '🟢';
  return Math.abs(varianceCents) > thresholdCents ? '🔴' : '🟡';
}

function formatShiftDate(iso: unknown): string {
  if (!iso || typeof iso !== 'string') return '';
  try {
    return new Date(iso).toLocaleDateString('en-KE', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatShiftTime(iso: unknown): string | null {
  if (!iso || typeof iso !== 'string') return null;
  try {
    return new Date(iso).toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
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
  subscription_expired: p => {
    const company = String(p.company || 'your company');
    const graceDate = p.gracePeriodEnd
      ? new Date(String(p.gracePeriodEnd)).toLocaleDateString('en-KE', { dateStyle: 'long' })
      : null;
    const graceLine = graceDate
      ? ` You can still view data until ${graceDate}, then access will be suspended.`
      : '';
    return {
      inAppTitle: 'Subscription Expired',
      inAppMessage: `${company}: subscription has expired.${graceLine}`,
      emailSubject: `Action required: ${company} subscription has expired`,
      emailBody: `Hi ${company} Team,\n\nYour DukaRun subscription has expired.${graceLine}\n\nPlease renew now to restore full access:\nhttps://dukarun.com/dashboard/admin/subscription\n\n– The DukaRun Team`,
      smsBody: `DukaRun: ${company} subscription has expired. Renew now at https://dukarun.com/dashboard/admin/subscription`,
    };
  },
  subscription_grace_period_ending: p => {
    const company = String(p.company || 'your company');
    const days = p.daysRemaining ?? 'a few';
    const dayWord = days === 1 ? 'day' : 'days';
    const graceDate = p.gracePeriodEnd
      ? new Date(String(p.gracePeriodEnd)).toLocaleDateString('en-KE', { dateStyle: 'long' })
      : null;
    const expiryLine = graceDate ? `\nAccess will be suspended on ${graceDate}.` : '';
    return {
      inAppTitle: 'Subscription Access Ending Soon',
      inAppMessage: `${company}: read-only access ends in ${days} ${dayWord}. Renew to avoid suspension.`,
      emailSubject: `Urgent: ${company} subscription access ends in ${days} ${dayWord}`,
      emailBody: `Hi ${company} Team,\n\nYour DukaRun subscription has expired and your read-only access ends in ${days} ${dayWord}.${expiryLine}\n\nRenew now to keep your store online:\nhttps://dukarun.com/dashboard/admin/subscription\n\n– The DukaRun Team`,
      smsBody: `DukaRun: ${company} read-only access ends in ${days} ${dayWord}. Renew now to avoid suspension.`,
    };
  },
  subscription_hard_expired: p => {
    const company = String(p.company || 'your company');
    return {
      inAppTitle: 'Subscription Suspended',
      inAppMessage: `${company}: subscription access has been suspended. Contact support to reactivate.`,
      emailSubject: `Suspended: ${company} subscription access`,
      emailBody: `Hi ${company} Team,\n\nYour DukaRun subscription access has been suspended because the renewal grace period has ended.\n\nContact support or renew your subscription to reactivate your account:\nhttps://dukarun.com/dashboard/admin/subscription\n\n– The DukaRun Team`,
      smsBody: `DukaRun: ${company} subscription is suspended. Contact support or renew to reactivate.`,
    };
  },
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
      whatsappBody: `Your account balance has been updated.\n\n*Outstanding balance: KES ${formatted}*\n\nIf you have questions about this update, please contact your supplier.`,
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
    const storeName = String(p.storeName || 'Your store');
    const cashierName = String(p.cashierName || 'Unknown');
    const date = formatShiftDate(p.openedAt);
    const time = formatShiftTime(p.openedAt);
    const balances = Array.isArray(p.openingBalances) ? p.openingBalances : [];
    const totalVariance = Number(p.totalOpeningVariance ?? 0);

    const header = `🟢 *Shift Opened — ${storeName}*`;
    const metaLines = [
      `*Cashier:* ${cashierName}`,
      date ? `*Date:* ${date}` : '',
      time ? `*Opened:* ${time}` : '',
    ].filter(Boolean);

    const balanceLines = balances.map((b: any) => {
      const code = String(b.accountCode ?? '').replace(/_/g, ' ');
      const declared = formatCentsKes(Number(b.declaredCents ?? 0));
      return `• ${code}: ${declared}`;
    });

    const varianceLine =
      totalVariance !== 0
        ? `\n*Opening variance:* ${formatCentsKes(Math.abs(totalVariance))}${
            totalVariance < 0 ? ' short' : ' over'
          }`
        : '';

    const footer = `\n_View full report:_ https://dukarun.com/dashboard/accounting?sessionId=${p.sessionId}\n— DukaRun Shift Report`;

    const whatsappBody = [header, '', ...metaLines, '', '*Opening balances*', ...balanceLines]
      .filter(Boolean)
      .join('\n');

    return {
      inAppTitle: 'Shift Opened',
      inAppMessage: time ? `Shift opened at ${time}.` : 'A new shift has been opened.',
      whatsappBody: `${whatsappBody}${varianceLine}${footer}`,
    };
  },
  shift_closed: p => {
    const storeName = String(p.storeName || 'Your store');
    const cashierName = String(p.cashierName || 'Unknown');
    const date = formatShiftDate(p.closedAt || p.openedAt);
    const openedTime = formatShiftTime(p.openedAt);
    const closedTime = formatShiftTime(p.closedAt);
    const varianceCents = Number(p.variance ?? 0);
    const thresholdCents = Number(p.varianceThresholdCents ?? 100);
    const emoji = getVarianceEmoji(varianceCents, thresholdCents);

    const openedAtMs = p.openedAt ? new Date(String(p.openedAt)).getTime() : 0;
    const closedAtMs = p.closedAt ? new Date(String(p.closedAt)).getTime() : 0;
    const durationMinutes =
      openedAtMs && closedAtMs ? Math.round((closedAtMs - openedAtMs) / 60000) : 0;

    const cashSales = Number(p.cashSales ?? 0);
    const creditSales = Number(p.creditSales ?? 0);
    const totalSales = cashSales + creditSales;
    const purchases = Number(p.purchases ?? 0);
    const cashTotal = Number(p.cashTotal ?? 0);
    const mpesaTotal = Number(p.mpesaTotal ?? 0);
    const totalCollected = Number(p.totalCollected ?? 0);
    const closingDeclared = Number(p.closingDeclared ?? 0);

    const header = `${emoji} *Shift Closed — ${storeName}*`;
    const metaLines = [
      `*Cashier:* ${cashierName}`,
      date ? `*Date:* ${date}` : '',
      openedTime && closedTime ? `*Time:* ${openedTime} – ${closedTime}` : '',
      durationMinutes > 0 ? `*Duration:* ${formatDuration(durationMinutes)}` : '',
    ].filter(Boolean);

    const salesLines = [
      `*Total sales:* ${formatCentsKes(totalSales)}`,
      `• Cash sales: ${formatCentsKes(cashSales)}`,
      `• Credit sales: ${formatCentsKes(creditSales)}`,
      `• Purchases: ${formatCentsKes(purchases)}`,
    ];

    const collectionLines = [
      `*Collections:*`,
      `• Cash: ${formatCentsKes(cashTotal)}`,
      `• M-Pesa: ${formatCentsKes(mpesaTotal)}`,
      `• Total collected: ${formatCentsKes(totalCollected)}`,
    ];

    const varianceLine =
      varianceCents !== 0
        ? `*Closing count:* ${formatCentsKes(closingDeclared)}\n*Variance:* ${formatCentsKes(
            Math.abs(varianceCents)
          )}${varianceCents < 0 ? ' short' : ' over'}`
        : `*Closing count:* ${formatCentsKes(closingDeclared)}\n*Variance:* None 🟢`;

    const footer = `\n_View full report:_ https://dukarun.com/dashboard/accounting?sessionId=${p.sessionId}\n— DukaRun Shift Report`;

    const whatsappBody = [header, '', ...metaLines, '', ...salesLines, '', ...collectionLines]
      .filter(Boolean)
      .join('\n');

    return {
      inAppTitle: 'Shift Closed',
      inAppMessage: closedTime
        ? `Shift closed at ${closedTime}.${
            varianceCents !== 0
              ? ` Variance: ${formatCentsKes(Math.abs(varianceCents))}${
                  varianceCents < 0 ? ' short' : ' over'
                }.`
              : ''
          }`
        : `Shift has been closed.${
            varianceCents !== 0
              ? ` Variance: ${formatCentsKes(Math.abs(varianceCents))}${
                  varianceCents < 0 ? ' short' : ' over'
                }.`
              : ''
          }`,
      whatsappBody: `${whatsappBody}\n\n${varianceLine}${footer}`,
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
