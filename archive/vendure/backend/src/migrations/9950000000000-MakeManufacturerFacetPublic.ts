import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make the "manufacturer" facet public so the public storefront (shop API) can display a product's
 * brand/manufacturer. `category` and `tags` facets stay private (internal POS filtering only).
 *
 * Product detail pages work immediately (they read product.facetValues). For manufacturer to also
 * appear in shop-api search facet aggregation (used by product-listing cards), run a search reindex
 * after this migration. Idempotent.
 */
export class MakeManufacturerFacetPublic9950000000000 implements MigrationInterface {
  name = 'MakeManufacturerFacetPublic9950000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'facet') THEN
          UPDATE "facet" SET "isPrivate" = false WHERE "code" = 'manufacturer';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'facet') THEN
          UPDATE "facet" SET "isPrivate" = true WHERE "code" = 'manufacturer';
        END IF;
      END $$;
    `);
  }
}
