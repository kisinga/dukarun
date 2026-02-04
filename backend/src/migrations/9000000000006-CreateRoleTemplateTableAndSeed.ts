import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create role_template table and seed the five channel admin templates.
 *
 * Standalone table (not Vendure config.customFields — Role is not in CustomFields).
 * Follows docs/VENDURE_CUSTOM_FIELDS.md: idempotent, guarded, build-before-run.
 * - Table: guarded with IF NOT EXISTS so replays and different env states are safe.
 * - Seed: ON CONFLICT (code) DO NOTHING so seed is idempotent.
 */
export class CreateRoleTemplateTableAndSeed9000000000006 implements MigrationInterface {
  name = 'CreateRoleTemplateTableAndSeed9000000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'role_template'
        ) THEN
          CREATE TABLE "role_template" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "code" character varying NOT NULL,
            "name" character varying NOT NULL,
            "description" text,
            "permissions" jsonb NOT NULL DEFAULT '[]',
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_role_template" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_role_template_code" UNIQUE ("code")
          );
        END IF;
      END $$;
    `);

    const adminPerms = [
      'CreateAsset',
      'ReadAsset',
      'UpdateAsset',
      'DeleteAsset',
      'CreateCatalog',
      'ReadCatalog',
      'UpdateCatalog',
      'DeleteCatalog',
      'CreateCustomer',
      'ReadCustomer',
      'UpdateCustomer',
      'DeleteCustomer',
      'CreateOrder',
      'ReadOrder',
      'UpdateOrder',
      'DeleteOrder',
      'CreateProduct',
      'ReadProduct',
      'UpdateProduct',
      'DeleteProduct',
      'CreateStockLocation',
      'ReadStockLocation',
      'UpdateStockLocation',
      'ReadChannel',
      'ReadSettings',
      'UpdateSettings',
      'CreateAdministrator',
      'UpdateAdministrator',
      'ReadAdministrator',
      'OverridePrice',
      'ApproveCustomerCredit',
      'ManageCustomerCreditLimit',
      'ManageStockAdjustments',
      'ManageReconciliation',
      'CloseAccountingPeriod',
      'ManageSupplierCreditPurchases',
    ];
    const cashierPerms = [
      'ReadAsset',
      'ReadChannel',
      'ReadOrder',
      'UpdateOrder',
      'ReadCustomer',
      'ReadProduct',
      'ApproveCustomerCredit',
      'ManageReconciliation',
    ];
    const accountantPerms = [
      'ReadAsset',
      'ReadChannel',
      'ReadOrder',
      'ReadCustomer',
      'ReadProduct',
      'ManageReconciliation',
      'CloseAccountingPeriod',
      'ManageCustomerCreditLimit',
      'ManageSupplierCreditPurchases',
    ];
    const salespersonPerms = [
      'ReadAsset',
      'ReadChannel',
      'CreateOrder',
      'ReadOrder',
      'CreateCustomer',
      'ReadCustomer',
      'ReadProduct',
      'OverridePrice',
    ];
    const stockkeeperPerms = [
      'ReadAsset',
      'ReadChannel',
      'CreateAsset',
      'CreateProduct',
      'ReadProduct',
      'UpdateProduct',
      'ReadStockLocation',
      'ManageStockAdjustments',
    ];

    const seed = [
      { code: 'admin', name: 'Admin', description: 'Full system access', permissions: adminPerms },
      {
        code: 'cashier',
        name: 'Cashier',
        description: 'Payment processing and credit approval',
        permissions: cashierPerms,
      },
      {
        code: 'accountant',
        name: 'Accountant',
        description: 'Financial oversight and reconciliation',
        permissions: accountantPerms,
      },
      {
        code: 'salesperson',
        name: 'Salesperson',
        description: 'Sales operations and customer management',
        permissions: salespersonPerms,
      },
      {
        code: 'stockkeeper',
        name: 'Stockkeeper',
        description: 'Inventory management',
        permissions: stockkeeperPerms,
      },
    ];

    for (const row of seed) {
      const permsJson = JSON.stringify(row.permissions);
      await queryRunner.query(
        `INSERT INTO "role_template" ("code", "name", "description", "permissions")
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT ("code") DO NOTHING`,
        [row.code, row.name, row.description, permsJson]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_template"`);
  }
}
