# Customer credit

- **Credit management** (approve, revoke, limit, duration) is done only from **Customer edit** (single UI). The Credit Management page is a read-only list with a "Manage" link to customer edit.
- **Frozen** means credit is disabled and the customer has an outstanding balance: no new credit can be extended; payments are still accepted. This is inferred from state (not approved + outstanding ≠ 0), not a separate stored field.
