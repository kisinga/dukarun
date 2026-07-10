# Approval and Cashier Flow

Short reference for how approvals relate to cashier flow.

## Approval pipeline (ApprovalPlugin)

- **Approvals page:** Lists approval request types (overdraft, order_reversal, etc.). Reviewers approve/reject; requesters are notified and can resubmit with `approvalId`.
- **SLA/reminders:** Approval requests support optional `dueAt`. A future job can query pending requests where `dueAt` is past (or near) to send reminders or escalate. See `frontend/.../APPROVAL-SYSTEM.md` (SLA and reminders).
- **Audit:** Every review (approve/reject) is logged as `approval.reviewed` in the audit trail.

## Cashier flow (order completion)

- **Channel setting:** `cashierFlowEnabled` is described as "orders require cashier approval before completion."
- **Current behaviour:** This is a UI/settings flag only. No backend logic keeps orders in a pending state or blocks completion until a cashier approves. See `docs/CASHIER_CASH_CONTROL_INTEGRATION.md` (Cashier Flow subsection) for the gap and how to implement the gate using the same approval/event pattern if needed.
