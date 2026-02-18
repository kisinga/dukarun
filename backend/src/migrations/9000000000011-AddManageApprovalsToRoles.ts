import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One-time migration: add ManageApprovals permission to
 * (1) every Role that has CreateAdministrator or UpdateAdministrator (channel admins),
 *     or ApproveCustomerCredit / ManageReconciliation (cashiers),
 * (2) role_template rows for admin and cashier so new channels get it.
 * Idempotent: skips rows that already have the permission.
 *
 * Vendure Role.permissions is simple-array (comma-separated). role_template.permissions is jsonb array.
 */
export class AddManageApprovalsToRoles9000000000011 implements MigrationInterface {
  name = 'AddManageApprovalsToRoles9000000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "role"
      SET "permissions" = CASE
        WHEN COALESCE(TRIM("permissions"), '') = '' THEN 'ManageApprovals'
        ELSE "permissions" || ',ManageApprovals'
      END
      WHERE (
        "permissions" LIKE '%CreateAdministrator%'
        OR "permissions" LIKE '%UpdateAdministrator%'
        OR "permissions" LIKE '%ApproveCustomerCredit%'
        OR "permissions" LIKE '%ManageReconciliation%'
      )
      AND ("permissions" NOT LIKE '%ManageApprovals%' OR "permissions" IS NULL)
    `);

    await queryRunner.query(`
      UPDATE "role_template"
      SET "permissions" = "permissions" || '["ManageApprovals"]'::jsonb
      WHERE "code" IN ('admin', 'cashier')
        AND NOT ("permissions" @> '["ManageApprovals"]'::jsonb)
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Removing a permission from roles is not safe without knowing original state; leave no-op.
  }
}
