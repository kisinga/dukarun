import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One-time migration: add CreateInterAccountTransfer permission to
 * (1) every Role that has ManageReconciliation or UpdateSettings,
 * (2) role_template rows for admin, accountant, cashier so new channels get it.
 * Idempotent: skips rows that already have the permission.
 *
 * Vendure Role.permissions is simple-array (comma-separated). role_template.permissions is jsonb array.
 */
export class AddCreateInterAccountTransferToRoles9000000000010 implements MigrationInterface {
  name = 'AddCreateInterAccountTransferToRoles9000000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "role"
      SET "permissions" = CASE
        WHEN COALESCE(TRIM("permissions"), '') = '' THEN 'CreateInterAccountTransfer'
        ELSE "permissions" || ',CreateInterAccountTransfer'
      END
      WHERE ("permissions" LIKE '%ManageReconciliation%' OR "permissions" LIKE '%UpdateSettings%')
        AND ("permissions" NOT LIKE '%CreateInterAccountTransfer%' OR "permissions" IS NULL)
    `);

    await queryRunner.query(`
      UPDATE "role_template"
      SET "permissions" = "permissions" || '["CreateInterAccountTransfer"]'::jsonb
      WHERE "code" IN ('admin', 'accountant', 'cashier')
        AND NOT ("permissions" @> '["CreateInterAccountTransfer"]'::jsonb)
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Removing a permission from roles is not safe without knowing original state; leave no-op.
  }
}
