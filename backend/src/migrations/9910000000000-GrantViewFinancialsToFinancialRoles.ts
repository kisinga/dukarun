import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grant the new `ViewFinancials` permission to existing admin/accountant roles.
 *
 * Context: the business financial *read* resolvers (period status, closed
 * periods, inventory valuation) were moved off the coarse built-in `ReadOrder`
 * onto the dedicated `ViewFinancials` permission. Role templates are seeded once
 * with no boot-time sync, so this migration performs the mandatory
 * grant-before-gate step for existing installs.
 *
 * Audience: any role/template that already holds `CloseAccountingPeriod` — i.e.
 * admin and accountant. Cashiers keep access to reconciliation/session reads via
 * their existing `ManageReconciliation` permission (those endpoints were gated to
 * ManageReconciliation, not ViewFinancials), so they are intentionally NOT
 * granted ViewFinancials and do not see the business Finances section.
 * Operational roles (salesperson, stockkeeper) receive nothing. Vendure's global
 * SuperAdmin bypasses @Allow, so it needs no grant.
 *
 * Idempotent + guarded so replays are safe.
 * - `role_template.permissions` is jsonb (array of strings).
 * - `role.permissions` is a Vendure simple-array (comma-separated text).
 */
export class GrantViewFinancialsToFinancialRoles9910000000000 implements MigrationInterface {
  name = 'GrantViewFinancialsToFinancialRoles9910000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Role templates (jsonb array) — grant to any template with CloseAccountingPeriod.
    await queryRunner.query(`
      UPDATE "role_template"
      SET "permissions" = "permissions" || '["ViewFinancials"]'::jsonb
      WHERE "permissions" @> '["CloseAccountingPeriod"]'::jsonb
        AND NOT ("permissions" @> '["ViewFinancials"]'::jsonb);
    `);

    // 2) Existing roles (simple-array comma-separated text) — grant to any role
    //    that already holds CloseAccountingPeriod and does not yet have ViewFinancials.
    await queryRunner.query(`
      UPDATE "role"
      SET "permissions" = "permissions" || ',ViewFinancials'
      WHERE (',' || "permissions" || ',') LIKE '%,CloseAccountingPeriod,%'
        AND (',' || "permissions" || ',') NOT LIKE '%,ViewFinancials,%';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove ViewFinancials from templates (jsonb minus by value).
    await queryRunner.query(`
      UPDATE "role_template"
      SET "permissions" = "permissions" - 'ViewFinancials'
      WHERE "permissions" @> '["ViewFinancials"]'::jsonb;
    `);

    // Remove ViewFinancials from roles (strip from the comma-separated list).
    await queryRunner.query(`
      UPDATE "role"
      SET "permissions" = trim(both ',' from replace(',' || "permissions" || ',', ',ViewFinancials,', ','))
      WHERE (',' || "permissions" || ',') LIKE '%,ViewFinancials,%';
    `);
  }
}
