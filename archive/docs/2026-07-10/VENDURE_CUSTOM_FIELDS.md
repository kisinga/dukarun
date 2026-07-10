# Vendure Custom Fields & Migration Playbook

> Scope: Dukarun backend (`backend/`) on Vendure 3.4 / TypeORM 0.3. This doc captures the patterns that keep `npm run dev` happy locally and ensure migrations replay cleanly on the managed Postgres instance declared in root `.env`.

---

## 1. Guiding Principles

1. **Model + Migration must stay in lockstep**
   - Update TypeScript entity/custom-field definitions first (`src/vendure-config.ts`, plugin entities).
   - Author migrations that reflect the _final_ schema (proper casing, constraint names, FK actions).
   - Never rely on `synchronize` – `dbConnectionOptions.synchronize` is `false` for a reason.

2. **Always build before running migrations**
   - Our migration script loads `./dist/src/vendure-config`.
   - Command sequence:
     ```bash
     cd backend
     npm run build
     node -e "require('dotenv').config({ path: '../.env' }); require('@vendure/core').runMigrations(require('./dist/src/vendure-config').config)"
     ```
   - In CI / production containers we lean on `npm run migration:run` which wraps the same call.

3. **Migrations must be idempotent and environment-agnostic**
   - Dev vs. cloud DBs may be at different intermediate states; use guarded SQL (`IF EXISTS`, `TRY/CATCH`) rather than blind renames.
   - Vendure auto-hashes constraint names (e.g. `FK_cfa828418e58de180707fd03e1a`). Guard for both legacy and hashed names when renaming.

4. **Custom-field relations require a non-relational companion**
   - Vendure inserts `customFields__fix_relational_custom_fields__` if you only declare relations.
   - Always add at least one scalar custom field (`boolean`, `int`, `string`, `datetime`) next to relations to prevent schema drift.
   - **Administrator profilePicture**: Administrator has a dummy boolean custom field only to satisfy Vendure/TypeORM when the only other custom field is the profilePicture relation (see migration `9000000000003-AddAdministratorProfilePicture.ts`).

5. **Standalone entities (not custom fields)**
   - Some schema is implemented as standalone tables and entities (e.g. `role_template`, `role_template_assignment`) because Vendure does not support custom fields on every core entity (e.g. Role).
   - The same migration principles apply: idempotent (IF NOT EXISTS / ON CONFLICT), guarded (DO $$ BEGIN ... EXCEPTION ... END $$ where useful), build-before-run, and document every schema touch. See [COMPANY_ADMINS.md](COMPANY_ADMINS.md) for the role-template tables.

---

## 2. Custom Field Checklist (Channel example)

When touching `config.customFields.Channel`:

1. **Relation names**: Vendure maps `subscriptionTier` → DB column `customFieldsSubscriptiontierid`. Keep naming consistent; TypeORM differs in casing for relations.
2. **Scalar companion**: Ensure fields like `subscriptionStatus`, `trialEndsAt`, etc. exist so Vendure doesn’t create workaround columns.
3. **UI metadata**: Keep `ui.tab` / `component` definitions updated alongside schema changes to avoid admin UI issues.
4. **Code usage**: Services such as `subscription.service.ts` must handle both new and legacy custom field shapes during migrations (string ID, object, legacy snake case).

### 2.1 Admin UI management tips

- Subscription fields surface on the Channel detail view under the **Subscription** tab.
- `subscriptionStatus` renders as a dropdown (Trial, Active, Expired, Cancelled); use it to unblock a customer after manual payment.
- `billingCycle` renders as a dropdown (Monthly, Yearly); align any manual change with the customer’s Paystack plan.
- Datetime fields (`trialEndsAt`, `subscriptionStartedAt`, `subscriptionExpiresAt`, `lastPaymentDate`) support manual edits—provide ISO timestamps or use the picker.
- `paystackCustomerCode` / `paystackSubscriptionCode` stay editable for recovery scenarios; update the Paystack references before activating a channel manually.

### 2.2 Customer credit fields (Nov 2025 refresh)

- `isCreditApproved` (`boolean`, default `false`) is the single flag the POS honors before it ever offers the credit payment option. Only roles with the new `ApproveCustomerCredit` permission can toggle it.
- `creditLimit` (`float`, default `0`) captures the agreed credit ceiling in base currency units (not cents). Limit adjustments are guarded by `ManageCustomerCreditLimit`.
- `outstandingAmount` continues to model the running balance: positive means we owe the supplier, negative means the customer owes us. Available headroom is computed as `creditLimit - abs(outstandingAmount)`.
- Migration `1762200000000-AddCustomerCreditFields.ts` introduces the columns with guarded `ALTER TABLE` statements. Run it alongside the updated `vendure-config.ts` to keep schema + config aligned.
- The credit plugin exposes GraphQL mutations and admin UI for approvals/limit changes—ensure the two custom permissions are assigned to back-office roles before surfacing the dashboard entry.

---

## 3. Migration Pattern Template

### 3.1 Structure your migration

```ts
await queryRunner.query(`
    DO $$
    BEGIN
        BEGIN
            ALTER TABLE "channel"
                RENAME COLUMN "customFieldsSubscriptionTierId" TO "customFieldsSubscriptiontierid";
        EXCEPTION
            WHEN undefined_column THEN
                NULL; -- column already renamed or never existed
        END;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'channel'
              AND column_name = 'customFieldsSubscriptiontierid'
        ) THEN
            ALTER TABLE "channel"
                ADD COLUMN "customFieldsSubscriptiontierid" uuid;
        END IF;
    END $$;
`);
```

Key points:

- Wrap dangerous operations in `BEGIN ... EXCEPTION` to tolerate replays.
- Check existence before `ADD COLUMN`.
- Prefer `ALTER TABLE ... RENAME CONSTRAINT` to dropping + recreating when only the name changes.

### 3.2 Constraint handling

```ts
DO $$
BEGIN
    BEGIN
        ALTER TABLE "channel"
            DROP CONSTRAINT "FK_channel_subscription_tier";
    EXCEPTION
        WHEN undefined_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE "channel"
            ADD CONSTRAINT "FK_cfa828418e58de180707fd03e1a"
            FOREIGN KEY ("customFieldsSubscriptiontierid")
            REFERENCES "subscription_tier"("id")
            ON DELETE NO ACTION
            ON UPDATE NO ACTION;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END $$;
```

Actions to remember:

- Vendure’s generated FKs typically use `NO ACTION`. Align explicit migrations with what Vendure generates to avoid perpetual diffs.
- For backwards compatibility, drop both legacy (`FK_channel_subscription_tier`) and hashed constraints before adding the definitive one.

### 3.3 Casing normalization

Vendure v3.4 lowercases custom field column names (e.g. `customFieldsSubscriptionstatus`). Run a migration to rename legacy camelCase columns:

```ts
ALTER TABLE "channel" RENAME COLUMN "customFieldsSubscriptionStatus" TO "customFieldsSubscriptionstatus";
```

Wrap in `IF EXISTS` to avoid failures on fresh DBs.

---

## 4. Local-to-Remote Migration Workflow

1. **Kick off changes**
   - Update `vendure-config.ts`, entity files, services. Ensure non-relational custom fields exist.

2. **Author migrations**
   - Place new files in `src/migrations/` with timestamped names.
   - Use the guard patterns above.
   - Reference hashed constraint names if Vendure already created them (check with `SELECT conname FROM pg_constraint ...`).

3. **Compile & run**

   ```bash
   npm run build
   node -e "require('dotenv').config({ path: '../configs/.env' }); require('@vendure/core').runMigrations(require('./dist/src/vendure-config').config)"
   ```

   - The script uses the same Postgres credentials as runtime; ensure VPN / network access to the remote host (`DB_HOST` in `.env`).

4. **Smoke test**

   ```bash
   npm run dev   # in backend/
   ```

   - Startup must complete without “schema does not match” warnings.
   - If a diff remains, inspect `pg_constraint` / `information_schema.columns` to find the leftover object and extend the migration guard.

5. **Verification SQL snippets**

   ```sql
   -- Channel subscription columns
   SELECT column_name
   FROM information_schema.columns
   WHERE table_name = 'channel' AND column_name ILIKE 'customFieldsSubscription%';

   -- FK constraint definition
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'public.channel'::regclass AND contype = 'f';
   ```

6. **Publish**
   - Commit both the TypeScript changes and the migration file.
   - During deployment, run `npm run build && npm run migration:run` (already invoked in Docker entrypoint) before starting the server.

---

## 5. Troubleshooting Reference

| Symptom                                                        | Likely Cause                                       | Fix                                                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `column ...customFieldsSubscriptiontieridid does not exist`    | Legacy column name from earlier migration persists | Add a migration that renames or drops the “double id” column and seeds `customFieldsSubscriptiontierid`.                                        |
| Startup warns “schema does not match” and suggests FK rename   | Constraint name or FK action differs               | Drop both legacy and hashed constraints, then add the hashed constraint with Vendure’s expected actions (see §3.2 / migration `1761900000005`). |
| Vendure creates `customFields__fix_relational_custom_fields__` | Only relational custom fields defined              | Add a scalar custom field alongside relations; run migration to drop the workaround column if already created.                                  |
| Migration fails with “already exists”                          | Running against DB where schema partially applied  | Wrap `ALTER` statements in `BEGIN ... EXCEPTION` and `IF EXISTS` guards. Re-run migration after adjusting.                                      |
| Startup suggests CREATE INDEX or ADD CONSTRAINT (schema drift) | With `synchronize: false`, TypeORM never creates indexes/FKs from decorators | Add an idempotent migration that creates the exact index and FK names TypeORM expects. See `9000000000009-AlignChannelIdIndexesAndAdministratorProfilePicture.ts` and MIGRATION_PATTERNS.md. |

---

## 6. Future-Proofing Tips

1. **Centralize new migrations around helper snippets**
   - Reuse the guard blocks in recent migrations (`1761900000001`–`0005`) when dealing with case renames or FK swaps.

2. **Document every schema touch**
   - Add comments inside migrations explaining why a guard exists (e.g. “Vendure 3.4 lowercases custom field columns”).

3. **Verify both dev & prod**
   - Our dev Postgres (Docker) and remote Postgres (homelab) may diverge. Always run migrations against both before merging.

4. **Regression tests**
   - Consider adding a Jest smoke test that boots Vendure in memory and asserts no schema diffs, catching issues earlier.

---

By following this playbook, we keep Vendure’s metadata cache, our TypeORM migrations, and the live Postgres schema aligned—without breaking local development workflows or tripping the “schema does not match” guardrails every time we touch subscription features.
