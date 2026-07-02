import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add public storefront custom fields to Channel:
 *   - customFieldsPublicstorefrontenabled (boolean) : merchant opt-in to publish the catalogue publicly
 *   - customFieldsPublicslug              (varchar) : subdomain label, e.g. "mama-mboga"
 *   - customFieldsPublicwhatsappnumber    (varchar) : E.164 WhatsApp contact for the "Order via WhatsApp" CTA
 *
 * Column casing follows Vendure's custom-field convention (lowercase the field name, capitalize the
 * first letter) — matches the live customFields* columns (verified against the running DB, e.g.
 * customFieldsStatus, customFieldsCashierflowenabled).
 *
 * Slug uniqueness is enforced at the APPLICATION layer (see updateChannelPublicStorefrontPlatform in
 * super-admin.resolver.ts), NOT by a DB index. Indexes on Vendure custom-field columns are not
 * tracked by TypeORM (synchronize:false), so a DB index would produce a permanent, misleading
 * "schema does not match → DROP INDEX" diff on every boot — exactly what migration 9900000000000
 * exists to remove. We deliberately avoid reintroducing that noise. Idempotent (IF NOT EXISTS).
 */
export class AddChannelPublicStorefrontFields9920000000000 implements MigrationInterface {
  name = 'AddChannelPublicStorefrontFields9920000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel"
            ADD COLUMN IF NOT EXISTS "customFieldsPublicstorefrontenabled" boolean NOT NULL DEFAULT false;
          ALTER TABLE "channel"
            ADD COLUMN IF NOT EXISTS "customFieldsPublicslug" character varying(255);
          ALTER TABLE "channel"
            ADD COLUMN IF NOT EXISTS "customFieldsPublicwhatsappnumber" character varying(255);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsPublicstorefrontenabled";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsPublicslug";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsPublicwhatsappnumber";
        END IF;
      END $$;
    `);
  }
}
