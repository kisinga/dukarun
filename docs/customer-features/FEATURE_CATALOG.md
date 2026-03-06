## Dukarun Feature Catalog (Customer-Facing)

This catalog gives a **business-focused overview of what Dukarun can do** for your shop, back office, and finance team.
It is written for:

- **Merchant owners & managers** – evaluating or running Dukarun
- **Operations / back-office staff** – configuring daily workflows
- **Product / marketing teams** – understanding capabilities and language

Each feature is tagged with its **origin**:

- **Vendure Core** – Standard capability from the Vendure commerce framework
- **Dukarun-Enhanced** – Vendure feature extended or hardened by Dukarun
- **Dukarun-Exclusive** – Net-new capability built specifically for Dukarun

For details and setup steps, follow the links to the **focused guides**.

---

## Guide Map

- [Authentication & Access Control](./auth-and-access.md)
- [Catalog, Products & AI Recognition](./inventory-and-stock.md#catalog-and-products)
- [Inventory & Stock Locations](./inventory-and-stock.md)
- [Orders, Checkout & Payments](./orders-and-billing.md)
- [Customers, Suppliers & Onboarding](./customers-and-onboarding.md)
- [Subscriptions & Account Status](./orders-and-billing.md#subscriptions--account-status)
- [Integrations & Automation](./integrations-and-automation.md)
- [Analytics, Credit & Ledger](./analytics-and-ledger.md)
- [Machine Learning & Smart Automation](./ml-and-intelligence.md)

---

## Authentication & Access Control

High-level feature set for **how people log in and what they can access**.

| Feature                                      | What it does                                                                                                                                                      | Who uses it                                   | Origin                                              | More details                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Admin login with phone or password           | Secure login to the Dukarun dashboard (admin side), using Vendure’s admin API and Dukarun’s frontend.                                                             | Owners, managers, staff with dashboard access | Dukarun-Enhanced (built on Vendure admin auth)      | [Auth & Access](./auth-and-access.md#admin-login-flows)                   |
| Role-based access control                    | Define roles (e.g. Owner, Manager, Cashier) and control which screens and operations each role can use. Scoped per business (channel).                            | Owners, back-office admins                    | Vendure Core + Dukarun-Enhanced (extra permissions) | [Auth & Access](./auth-and-access.md#roles--permissions)                  |
| Channel-based scoping (multi-company)        | Each business runs in an isolated “channel”. Users only see data for the channels they are assigned to.                                                           | Multi-shop owners, group admins               | Vendure Core + Dukarun-Enhanced                     | [Auth & Access](./auth-and-access.md#channels--multi-tenancy)             |
| Two-tier approval (user + business)          | New sign-ups go through **user-level approval** (account) and **channel-level approval** (business). Pending businesses operate in read-only mode until approved. | Dukarun back-office, compliance               | Dukarun-Exclusive                                   | [Auth & Access](./auth-and-access.md#two-tier-approval-flow)              |
| Approvals queue                             | Dashboard screen to view and act on pending user and channel approvals (when permitted).                                                                          | Back-office, admins                            | Dukarun-Exclusive                                   | [Auth & Access](./auth-and-access.md#two-tier-approval-flow)               |
| Subscription-aware access (trial, read-only) | Trial, active, expired, and cancelled subscription states control whether a business has full or read-only functionality.                                         | Dukarun back-office, billing                  | Dukarun-Exclusive                                   | [Orders & Billing](./orders-and-billing.md#subscriptions--account-status) |

---

## Catalog, Products & AI Recognition

How you define what you sell and how the POS finds it quickly.

| Feature                            | What it does                                                                                                                | Who uses it                                  | Origin                                             | More details                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Product catalog with multiple SKUs | One product with multiple price/size options (e.g. 1kg, 2kg, 5kg).                                                          | Owners, inventory managers                   | Vendure Core (products/variants) used as-is        | [Inventory & Stock](./inventory-and-stock.md#catalog-and-products)    |
| Barcode-based product lookup       | Scan barcodes to add packaged goods to the cart or create products from an existing barcode.                                | Cashiers, stock controllers                  | Dukarun-Enhanced (on Vendure products)             | [Inventory & Stock](./inventory-and-stock.md#barcode-products)        |
| Label-photo AI recognition         | Use your phone camera to recognize **price labels/cards** for fresh produce and services, and add the correct item to cart. | Cashiers in markets, salons, informal retail | Dukarun-Exclusive                                  | [ML & Intelligence](./ml-and-intelligence.md#label-photo-recognition) |
| Service products without stock     | Sell services (e.g. haircuts) with infinite availability, while still tracking revenue.                                     | Salons, barbers, service businesses          | Vendure Core (trackInventory flag) surfaced in POS | [Inventory & Stock](./inventory-and-stock.md#services)                |
| Offline-ready catalog cache        | Pre-loads the active business’s catalog into the browser so sales stay snappy and resilient to spotty internet.             | All POS users                                | Dukarun-Exclusive                                  | [ML & Intelligence](./ml-and-intelligence.md#offline-first-pos)       |

---

## Inventory & Stock Locations

How Dukarun tracks **where your stock lives and how much you have**.

| Feature                              | What it does                                                                                             | Who uses it                 | Origin                      | More details                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Stock locations per business         | Define physical shops or warehouses for each business (channel). Inventory is tracked at location level. | Owners, operations          | Vendure Core                | [Inventory & Stock](./inventory-and-stock.md#stock-locations)              |
| POS-focused stock tracking           | Simple, location-based stock counts optimized for small retailers (no complex fulfilment).               | Cashiers, stock controllers | Dukarun-Enhanced            | [Inventory & Stock](./inventory-and-stock.md#stock-and-adjustments)        |
| Stock adjustments (future extension) | Planned conversion workflows (e.g. 100kg bulk → 1kg/2kg packs) with clear audit trail.                   | Owners, operations          | Dukarun-Exclusive (planned) | [Inventory & Stock](./inventory-and-stock.md#stock-conversion-future)      |
| Cashier-flow toggles per location    | Enable/disable a **two-step cashier flow** per location (salesperson vs cashier station).                | Owners, store managers      | Dukarun-Exclusive           | [Orders & Billing](./orders-and-billing.md#cashier-flow-two-step-checkout) |

---

## Orders, Checkout & Payments

Everything around **selling, taking payment, and tracking order status**.

| Feature                              | What it does                                                                                                 | Who uses it           | Origin                                  | More details                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| POS-style order flow (no shipping)   | Streamlined order flow optimized for in-store sales: draft → payment → completed, no shipping configuration. | Cashiers              | Dukarun-Enhanced (custom order process) | [Orders & Billing](./orders-and-billing.md#pos-order-flow)                 |
| Walk-in customer support             | Reuse a single “Walk-in customer” for anonymous sales while still keeping accounting clean.                  | Cashiers, owners      | Dukarun-Enhanced                        | [Customers & Onboarding](./customers-and-onboarding.md#walk-in-customers)  |
| Multi-tender payments (cash, M‑Pesa) | Take payments via cash and M‑Pesa (with Dukarun’s payment handlers and ledger postings).                     | Cashiers, finance     | Dukarun-Exclusive                       | [Orders & Billing](./orders-and-billing.md#payment-methods)                |
| Price overrides with permission      | Allow only trusted staff to override prices during checkout, with an audit trail.                            | Managers, supervisors | Dukarun-Exclusive                       | [Orders & Billing](./orders-and-billing.md#price-override-controls)        |
| Two-step cashier flow                | Salesperson sends order to a cashier station for payment, ideal for busy counters.                           | Sales staff, cashiers | Dukarun-Exclusive                       | [Orders & Billing](./orders-and-billing.md#cashier-flow-two-step-checkout) |

---

## Subscriptions & Account Status

How Dukarun handles **trials, subscriptions, and read-only mode**.

| Feature                           | What it does                                                                                             | Who uses it                        | Origin            | More details                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------- | -------------------------------------------------------------------- |
| Free trial per business           | New businesses start on a full-feature trial. Trial duration is configured by the platform.             | Dukarun back-office, new customers | Dukarun-Exclusive | [Orders & Billing](./orders-and-billing.md#trial-periods)            |
| Paystack subscription integration | Charge businesses via Paystack (including STK push), track subscription tier and renewals.               | Dukarun back-office, finance       | Dukarun-Exclusive | [Orders & Billing](./orders-and-billing.md#paystack-subscriptions)   |
| Read-only mode on expiry          | When a subscription expires, users can still log in and view data but **cannot create or edit** records. | All business users                 | Dukarun-Exclusive | [Orders & Billing](./orders-and-billing.md#read-only-mode-on-expiry) |

---

## Customers, Suppliers & Credit

Dukarun’s **unified people model** for customers, suppliers and credit accounts.

| Feature                              | What it does                                                                                              | Who uses it                      | Origin                                  | More details                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| Unified customers & suppliers        | Treat every supplier as a special kind of customer with extra fields (supplier type, terms, notes).       | Owners, purchasing, finance      | Dukarun-Exclusive (on Vendure Customer) | [Customers & Onboarding](./customers-and-onboarding.md#customers-and-suppliers)  |
| Mobile-first customer/supplier forms | Single-step customer and two-step supplier forms optimized for mobile keyboards and Kenyan phone formats. | Cashiers, admins                 | Dukarun-Exclusive                       | [Customers & Onboarding](./customers-and-onboarding.md#mobile-first-forms)       |
| Credit approvals & limits            | Mark customers as credit-approved, set limits, and let the POS enforce credit rules at checkout.          | Back-office credit team, finance | Dukarun-Exclusive                       | [Analytics & Ledger](./analytics-and-ledger.md#customer-credit-management)       |
| Outstanding balances per party       | Track how much each customer owes you and how much you owe each supplier, sourced from the ledger.        | Finance, owners                  | Dukarun-Exclusive (ledger integration)  | [Analytics & Ledger](./analytics-and-ledger.md#balances-and-outstanding-amounts) |

---

## Integrations & Automation

How Dukarun **connects with the outside world** and automates processes.

| Feature                                      | What it does                                                                                                        | Who uses it                  | Origin            | More details                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| GraphQL API (admin)                          | Full admin API for managing products, orders, customers, and more – the same API Dukarun’s dashboard uses.          | Internal tools, integrations | Vendure Core      | [Integrations & Automation](./integrations-and-automation.md#graphql-admin-api)         |
| Webhook-style ML training integration        | Generate manifests and accept ML models from external training services.                                            | ML team, integrators         | Dukarun-Exclusive | [ML & Intelligence](./ml-and-intelligence.md#ml-training-pipeline)                      |
| Paystack payments and webhooks               | Receive subscription and payment updates via Paystack webhooks and map them to channel state.                       | Dukarun back-office, finance | Dukarun-Exclusive | [Integrations & Automation](./integrations-and-automation.md#paystack-integration)      |
| Notification system (events → toasts & push) | Event-driven notifications for orders, stock, ML training, and payments; surfaced in-app and as push notifications. | All dashboard users          | Dukarun-Exclusive | [Integrations & Automation](./integrations-and-automation.md#notification-system)       |
| Observability hooks (traces, metrics)        | Instrumented traces and metrics via SigNoz/OpenTelemetry for troubleshooting and SLOs.                              | Dukarun engineering & ops    | Dukarun-Exclusive | [Integrations & Automation](./integrations-and-automation.md#observability--monitoring) |

---

## Analytics, Credit & Ledger

Financial features that turn Dukarun into a **lightweight accounting layer**.

| Feature                                  | What it does                                                                                             | Who uses it                      | Origin            | More details                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| Double-entry ledger per business         | Every sale, payment and purchase posts balanced entries into a channel-specific ledger.                  | Finance, accountants, auditors   | Dukarun-Exclusive | [Analytics & Ledger](./analytics-and-ledger.md#double-entry-ledger)                             |
| Channel-specific chart of accounts       | Each business gets its own chart of accounts (cash, MPesa, AR/AP, sales, purchases, etc.).               | Dukarun provisioning, finance    | Dukarun-Exclusive | [Customers & Onboarding](./customers-and-onboarding.md#channel-provisioning--chart-of-accounts) |
| Customer & supplier balances from ledger | Outstanding amounts for every customer and supplier are calculated from ledger entries (no ad-hoc math). | Finance, collections, purchasing | Dukarun-Exclusive | [Analytics & Ledger](./analytics-and-ledger.md#balances-and-outstanding-amounts)                |
| Credit limit enforcement at POS          | Checkout validates credit headroom before allowing “sell on credit” flows.                               | Cashiers, credit control         | Dukarun-Exclusive | [Analytics & Ledger](./analytics-and-ledger.md#customer-credit-management)                      |
| Accounting (ledger, expenses, transfers) | Dashboard accounting section: ledger view (overview, accounts, transactions, reconciliation), expenses, inter-account transfers.                                 | Finance, owners                  | Dukarun-Exclusive | [Analytics & Ledger](./analytics-and-ledger.md#double-entry-ledger)                             |
| Basic performance dashboards             | Channel-level dashboards for sales and inventory KPIs (designed for small shops, not full BI).           | Owners, managers                 | Dukarun-Enhanced  | [Analytics & Ledger](./analytics-and-ledger.md#kpi-dashboards)                                  |

---

## Machine Learning & Smart Automation

AI-powered shortcuts that make Dukarun **feel magical but stay practical**.

| Feature                                          | What it does                                                                                                        | Who uses it                         | Origin            | More details                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------- | --------------------------------------------------------------------- |
| Label-photo product recognition at POS           | Point your camera at a handwritten price label or service card; Dukarun recognizes the product and adds it to cart. | Cashiers in markets, salons, kiosks | Dukarun-Exclusive | [ML & Intelligence](./ml-and-intelligence.md#label-photo-recognition) |
| Per-business ML models                           | Each business gets its own model trained on its own labels and catalog.                                             | Dukarun ML ops, larger retailers    | Dukarun-Exclusive | [ML & Intelligence](./ml-and-intelligence.md#per-channel-ml-models)   |
| Automated photo extraction & manifest generation | Automatically builds training datasets from product photos and outputs a manifest for external trainers.            | ML team, integrators                | Dukarun-Exclusive | [ML & Intelligence](./ml-and-intelligence.md#ml-training-pipeline)    |
| Offline model caching                            | Models are cached in the browser for fast, offline-ish inference.                                                   | Cashiers                            | Dukarun-Exclusive | [ML & Intelligence](./ml-and-intelligence.md#offline-first-pos)       |

---

## Operations & Reliability (Internal)

These features are mostly relevant for **ops and engineering**, but help explain reliability to customers.

| Feature                      | What it does                                                                                            | Who uses it               | Origin                             | More details                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Containerized deployment     | Backend, frontend, database and observability run as separate containers, deployable on most platforms. | DevOps, IT                | Dukarun-Exclusive deployment layer | [Integrations & Automation](./integrations-and-automation.md#deployment--infrastructure) |
| First-run initialization     | One-shot database bootstrap and migration to prevent schema issues on new installs.                     | DevOps, IT                | Dukarun-Exclusive                  | [Integrations & Automation](./integrations-and-automation.md#first-run-initialization)   |
| Observability stack (SigNoz) | Centralized traces, logs and metrics for backend and frontend.                                          | Dukarun engineering & ops | Dukarun-Exclusive                  | [Integrations & Automation](./integrations-and-automation.md#observability--monitoring)  |

---

## How to Use This Catalog

- **Merchants & Managers** – Use this as a **capability map** when evaluating Dukarun or onboarding new staff.
- **Operations / Implementers** – Use the links to focused guides to configure each area step by step.
- **Product & Marketing** – Reuse the language here in pitch decks, landing pages and onboarding emails; it is aligned with the underlying implementation.

If you are unsure where a feature fits, start from the **focused guide that matches the business problem** (e.g. “We need to sell on credit” → [Analytics & Ledger](./analytics-and-ledger.md), “We want trial + subscription” → [Orders & Billing](./orders-and-billing.md)).
