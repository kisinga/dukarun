import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align schema with TypeORM entity metadata so "schema does not match" no longer appears at startup.
 *
 * With synchronize: false, TypeORM never creates indexes or FKs from @Index / @ManyToOne decorators.
 * Entities declare:
 * - @Index('IDX_stock_purchase_channel', ['channelId']) etc. on stock entities
 * - Administrator customFieldsProfilepictureid -> asset(id) FK
 *
 * This migration creates the exact index and FK names TypeORM expects, idempotently.
 * See docs/VENDURE_CUSTOM_FIELDS.md §5 (Troubleshooting) and MIGRATION_PATTERNS.md.
 */
export class AlignChannelIdIndexesAndAdministratorProfilePicture9000000000009 implements MigrationInterface {
  name = 'AlignChannelIdIndexesAndAdministratorProfilePicture9000000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Channel ID indexes (entity @Index() names; never created because synchronize is false) ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_purchase_channel" ON "stock_purchase" ("channelId");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_purchase_payment_channel" ON "purchase_payment" ("channelId");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_stock_adjustment_channel" ON "inventory_stock_adjustment" ("channelId");
    `);

    // --- Administrator profile picture FK (TypeORM-expected name; migration 9000000000003 only added column) ---
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_29cfdde44013ec39bbc39a64783'
        ) THEN
          ALTER TABLE "administrator"
            ADD CONSTRAINT "FK_29cfdde44013ec39bbc39a64783"
            FOREIGN KEY ("customFieldsProfilepictureid")
            REFERENCES "asset"("id")
            ON DELETE NO ACTION
            ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_stock_purchase_channel";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_purchase_payment_channel";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_inventory_stock_adjustment_channel";
    `);
    await queryRunner.query(`
      ALTER TABLE "administrator" DROP CONSTRAINT IF EXISTS "FK_29cfdde44013ec39bbc39a64783";
    `);
  }
}
