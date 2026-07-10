# Internal Approval Workflows

This document clarifies where different "approval" flows live so the Approvals page and future pipeline (SLAs, reminders, reports) have a clear scope.

## 1. ApprovalPlugin approval requests (Approvals page)

**Scope:** The **Approvals** dashboard page and `getApprovalRequests` / `reviewApprovalRequest` API.

**Types:** `overdraft`, `customer_credit`, `below_wholesale`, `order_reversal`, and any new types you register.

**Flow:** User hits a condition that requires oversight → creates an approval request → admins are notified → reviewer approves/rejects on the Approvals page → requester is notified and can resubmit with `approvalId`.

**Where:** Channel-scoped; each channel has its own pending list. See [frontend APPROVAL-SYSTEM.md](../frontend/src/app/dashboard/pages/shared/directives/APPROVAL-SYSTEM.md) and backend `ApprovalPlugin` / `ApprovalService`.

## 2. Channel and user authorization (registration)

**Scope:** New company registration and channel status (UNAPPROVED → APPROVED / DISABLED / BANNED). User-level `authorizationStatus` (PENDING / APPROVED / REJECTED).

**Flow:** Company registers → channel and user are in pending state → platform or super-admin approves channel/user → channel status and user authorization status are updated. Not part of the generic ApprovalPlugin inbox.

**Where:** Super-admin or separate admin UI; see `docs/AUTHORIZATION_WORKFLOW.md` and `docs/CHANNEL_STATUS_AUTH.md`.

## 3. Credit approval (customer/supplier)

**Scope:** Marking a customer or supplier as credit-approved and setting limits.

**Flow:** Admin uses Credit UI to approve credit and set limits; no generic "approval request" is created. Separate from the Approvals page.

**Where:** Credit plugin mutations (e.g. `approveCustomerCredit`); see credit dashboard and `docs/customer-features/analytics-and-ledger.md`.

---

## Summary

| Stream                    | Where it lives              | Approvals page? |
|---------------------------|-----------------------------|------------------|
| Plugin approval requests  | ApprovalPlugin, Approvals   | Yes              |
| Channel/user registration | Auth, channel settings      | No (super-admin) |
| Credit approval           | Credit plugin               | No               |

The pipeline (events, SLAs, audit, rejection reasons) is aligned for **ApprovalPlugin** request types. Registration and credit flows can adopt similar patterns later (e.g. events, audit) but are not part of the single Approvals inbox today.
