import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grant the new `SettleOrder` permission to existing roles that take payments.
 *
 * Context: cashier settlement (including split payments across tenders) is gated on a
 * dedicated `SettleOrder` permission rather than the coarse built-in `UpdateOrder`.
 * Role templates are seeded once with no boot-time sync, so this migration performs the
 * mandatory grant-before-gate step for existing installs — otherwise the settle
 * mutation would 403 for every non-SuperAdmin until roles are re-provisioned.
 *
 * Audience: any role/template that already holds `UpdateOrder` — i.e. admin and cashier
 * (the roles that record payments today). Read-only roles (accountant), sales
 * (salesperson: CreateOrder/ReadOrder only) and stock roles do not hold UpdateOrder and
 * are intentionally not granted SettleOrder. Vendure's global SuperAdmin bypasses
 * @Allow, so it needs no grant.
 *
 * Idempotent + guarded so replays are safe.
 * - `role_template.permissions` is jsonb (array of strings).
 * - `role.permissions` is a Vendure simple-array (comma-separated text).
 */
export class GrantSettleOrderToPaymentRoles9940000000000 implements MigrationInterface {
  name = 'GrantSettleOrderToPaymentRoles9940000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Role templates (jsonb array) — grant to any template with UpdateOrder.
    await queryRunner.query(`
      UPDATE "role_template"
      SET "permissions" = "permissions" || '["SettleOrder"]'::jsonb
      WHERE "permissions" @> '["UpdateOrder"]'::jsonb
        AND NOT ("permissions" @> '["SettleOrder"]'::jsonb);
    `);

    // 2) Existing roles (simple-array comma-separated text) — grant to any role
    //    that already holds UpdateOrder and does not yet have SettleOrder.
    await queryRunner.query(`
      UPDATE "role"
      SET "permissions" = "permissions" || ',SettleOrder'
      WHERE (',' || "permissions" || ',') LIKE '%,UpdateOrder,%'
        AND (',' || "permissions" || ',') NOT LIKE '%,SettleOrder,%';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove SettleOrder from templates (jsonb minus by value).
    await queryRunner.query(`
      UPDATE "role_template"
      SET "permissions" = "permissions" - 'SettleOrder'
      WHERE "permissions" @> '["SettleOrder"]'::jsonb;
    `);

    // Remove SettleOrder from roles (strip from the comma-separated list).
    await queryRunner.query(`
      UPDATE "role"
      SET "permissions" = trim(both ',' from replace(',' || "permissions" || ',', ',SettleOrder,', ','))
      WHERE (',' || "permissions" || ',') LIKE '%,SettleOrder,%';
    `);
  }
}
