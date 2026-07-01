import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrateAssetTranslationData, migrateProductOptionGroupData } from '@vendure/core';

/**
 * Vendure core 3.5.2 → 3.6.4 schema upgrade.
 *
 * DATA MOVEMENT follows the official Vendure 3.6 migration guide exactly: the
 * shipped, idempotent helpers `migrateProductOptionGroupData` and
 * `migrateAssetTranslationData` are called immediately BEFORE the matching
 * `DROP COLUMN`, surrounded by the schema DDL. They are the canonical, tested
 * data-migration path:
 *   - migrateProductOptionGroupData: product↔group + option/group channel joins,
 *     incl. orphan sweeps (NULL productId / channel-less groups+options) → __default_channel__.
 *   - migrateAssetTranslationData: asset.name → asset_translation using the DEFAULT
 *     CHANNEL's defaultLanguageCode; throws if __default_channel__ is missing.
 * Both are hasColumn-guarded, so on a DB where the source column is already gone
 * they no-op.
 *
 * DDL is GUARDED (IF [NOT] EXISTS) — deliberately NOT the verbatim auto-generated
 * DDL — because this app provisions a fresh/empty DB with `synchronize: true`
 * (utils/bootstrap-init.ts: runSchemaBootstrap) which creates the full 3.6 schema
 * BEFORE migrations run. So this migration must be correct on BOTH paths:
 *   - Fresh DB (synchronize ran): new tables ALREADY exist and asset.name /
 *     product_option_group.productId do NOT — guards make every statement a no-op.
 *   - Existing prod DB (3.5.2 schema): new tables are absent and the old columns
 *     exist — guards let every statement run.
 * A verbatim plain-DDL copy of the docs example would error on the fresh path
 * ("relation already exists" / "column does not exist").
 *
 * Atomicity: TypeORM runs each migration in one transaction (transaction:'each');
 * on Postgres all DDL is transactional, so any failure rolls back the whole
 * migration AND its migrations-table row — no half-applied state.
 *
 * Rollback: down() is a SCHEMA-ONLY reverse (it does NOT restore dropped data —
 * neither does Vendure's generated down()). The guaranteed data rollback is to
 * restore the pre-deploy database backup.
 */
export class UpgradeVendureCore360Schema9600000000000 implements MigrationInterface {
  name = 'UpgradeVendureCore360Schema9600000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Create new 3.6 tables (exact PK/UQ/FK/index names from the generated diff). ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "asset_translation" (
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "languageCode" character varying NOT NULL,
        "name" character varying NOT NULL,
        "id" SERIAL NOT NULL,
        "baseId" integer,
        CONSTRAINT "PK_2f22e63eefeef14d245bdb956b6" PRIMARY KEY ("id"),
        CONSTRAINT "FK_4eed4464adef51f53e1c7d80212" FOREIGN KEY ("baseId")
          REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_4eed4464adef51f53e1c7d8021" ON "asset_translation" ("baseId")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_key" (
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "lookupId" character varying NOT NULL,
        "apiKeyHash" character varying NOT NULL,
        "lastUsedAt" TIMESTAMP,
        "deletedAt" TIMESTAMP,
        "id" SERIAL NOT NULL,
        "ownerId" integer NOT NULL,
        "userId" integer NOT NULL,
        CONSTRAINT "UQ_ade30668b991772489bf875be5f" UNIQUE ("lookupId"),
        CONSTRAINT "UQ_3c254ac4ce1a6d4a26da30c5575" UNIQUE ("apiKeyHash"),
        CONSTRAINT "PK_b1bd840641b8acbaad89c3d8d11" PRIMARY KEY ("id"),
        CONSTRAINT "FK_74d2236b1de818d00bd3fd01602" FOREIGN KEY ("ownerId")
          REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_277972f4944205eb29127f9bb6c" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_key_translation" (
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "languageCode" character varying NOT NULL,
        "name" character varying NOT NULL,
        "id" SERIAL NOT NULL,
        "baseId" integer,
        CONSTRAINT "PK_b703f4951cec9da71354120bd8a" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bf45bd67c7b3278d7e1f2f95170" FOREIGN KEY ("baseId")
          REFERENCES "api_key"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bf45bd67c7b3278d7e1f2f9517" ON "api_key_translation" ("baseId")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_key_channels_channel" (
        "apiKeyId" integer NOT NULL,
        "channelId" integer NOT NULL,
        CONSTRAINT "PK_acb0650ccd9b2df593d1b4f1c52" PRIMARY KEY ("apiKeyId", "channelId"),
        CONSTRAINT "FK_460b1afc096014ca2dc5a5f5aa9" FOREIGN KEY ("apiKeyId")
          REFERENCES "api_key"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_d37be6b22047f56ea87bea795b6" FOREIGN KEY ("channelId")
          REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_460b1afc096014ca2dc5a5f5aa" ON "api_key_channels_channel" ("apiKeyId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_d37be6b22047f56ea87bea795b" ON "api_key_channels_channel" ("channelId")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_option_channels_channel" (
        "productOptionId" integer NOT NULL,
        "channelId" integer NOT NULL,
        CONSTRAINT "PK_be681a3bd2f92f17d084fa4375a" PRIMARY KEY ("productOptionId", "channelId"),
        CONSTRAINT "FK_8dbe001861ca34ae8b687e6baef" FOREIGN KEY ("productOptionId")
          REFERENCES "product_option"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_717e7792b8f31c319b6c7b81352" FOREIGN KEY ("channelId")
          REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_8dbe001861ca34ae8b687e6bae" ON "product_option_channels_channel" ("productOptionId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_717e7792b8f31c319b6c7b8135" ON "product_option_channels_channel" ("channelId")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_option_group_channels_channel" (
        "productOptionGroupId" integer NOT NULL,
        "channelId" integer NOT NULL,
        CONSTRAINT "PK_ddad9696c49ebbc8032caf76fe3" PRIMARY KEY ("productOptionGroupId", "channelId"),
        CONSTRAINT "FK_4fbe6303db2827370c0ec2d0276" FOREIGN KEY ("productOptionGroupId")
          REFERENCES "product_option_group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_d689965b8c58ebf316fce60fab2" FOREIGN KEY ("channelId")
          REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_4fbe6303db2827370c0ec2d027" ON "product_option_group_channels_channel" ("productOptionGroupId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_d689965b8c58ebf316fce60fab" ON "product_option_group_channels_channel" ("channelId")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_option_groups_product_option_group" (
        "productId" integer NOT NULL,
        "productOptionGroupId" integer NOT NULL,
        CONSTRAINT "PK_6a7a0291e226fbb0d4df828a483" PRIMARY KEY ("productId", "productOptionGroupId"),
        CONSTRAINT "FK_9148fe2c2fd83f5b59d391088c5" FOREIGN KEY ("productId")
          REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_9b03a92219b0684dbd4403e6246" FOREIGN KEY ("productOptionGroupId")
          REFERENCES "product_option_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_9148fe2c2fd83f5b59d391088c" ON "product_option_groups_product_option_group" ("productId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_9b03a92219b0684dbd4403e624" ON "product_option_groups_product_option_group" ("productOptionGroupId")`
    );

    // ── Product↔OptionGroup: drop the old FK column's constraint+index (3.5.2 only). ──
    await queryRunner.query(
      `ALTER TABLE "product_option_group" DROP CONSTRAINT IF EXISTS "FK_a6e91739227bf4d442f23c52c75"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_a6e91739227bf4d442f23c52c7"`);

    // ── Official data migration, then drop the source column (per Vendure 3.6 docs). ──
    await migrateProductOptionGroupData(queryRunner);
    await queryRunner.query(`ALTER TABLE "product_option_group" DROP COLUMN IF EXISTS "productId"`);

    // ── Official data migration, then drop the source column (per Vendure 3.6 docs). ──
    await migrateAssetTranslationData(queryRunner);
    await queryRunner.query(`ALTER TABLE "asset" DROP COLUMN IF EXISTS "name"`);

    // ── Administrator unique constraint removed in 3.6 (dup-email now enforced in app layer). ──
    await queryRunner.query(
      `ALTER TABLE "administrator" DROP CONSTRAINT IF EXISTS "UQ_154f5c538b1576ccc277b1ed631"`
    );

    // NOTE: the generated diff also wanted to DROP the two app custom-field indexes
    // "IDX_order_customFields_cogsStatus" (migration 9500000000003) and
    // "IDX_customer_customFields_isSupplier" (migration 9500000000002). These are
    // intentional perf indexes TypeORM's metadata doesn't track and are NOT part of
    // the 3.6 schema change — they are NOT dropped here. They are dropped in
    // migration 9900000000000 to silence the boot-time "schema does not match" log
    // (this Vendure version has no custom-field `index` config option to track them).
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SCHEMA-ONLY reverse (idempotent). Does NOT restore dropped data — the
    // supported data rollback is restoring the pre-deploy backup. Columns are
    // re-added NULLABLE so the reverse is runnable on a populated table.
    await queryRunner.query(`DROP TABLE IF EXISTS "api_key_channels_channel"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_key_translation"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_option_channels_channel"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_option_group_channels_channel"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_option_groups_product_option_group"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "asset_translation"`);

    await queryRunner.query(
      `ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "name" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "product_option_group" ADD COLUMN IF NOT EXISTS "productId" integer`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_a6e91739227bf4d442f23c52c7" ON "product_option_group" ("productId")`
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_a6e91739227bf4d442f23c52c75') THEN
          ALTER TABLE "product_option_group"
            ADD CONSTRAINT "FK_a6e91739227bf4d442f23c52c75" FOREIGN KEY ("productId")
            REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UQ_154f5c538b1576ccc277b1ed631') THEN
          ALTER TABLE "administrator"
            ADD CONSTRAINT "UQ_154f5c538b1576ccc277b1ed631" UNIQUE ("emailAddress");
        END IF;
      END $$;
    `);
  }
}
