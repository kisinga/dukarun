import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Product.mlEmbedding + Product.mlEmbeddingVersion custom fields for on-device image recognition.
 *
 *   - customFieldsMlembedding        (text)    : JSON array of per-image embeddings (number[][], 512-dim
 *                                                fp32, L2-normalized). Written by the app at enrollment;
 *                                                the backend never computes or interprets it.
 *   - customFieldsMlembeddingversion (varchar) : the embedder version those fingerprints were made with.
 *
 * Both nullable, no FK, no index — a plain additive column add. Column casing follows Vendure's
 * custom-field convention (lowercase the field name, capitalize the first letter), matching the live
 * `customFieldsBarcode` / `customFieldsCogsstatus` columns. Idempotent (IF NOT EXISTS).
 */
export class AddProductMlEmbeddingFields9700000000000 implements MigrationInterface {
  name = 'AddProductMlEmbeddingFields9700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'product'
        ) THEN
          ALTER TABLE "product"
            ADD COLUMN IF NOT EXISTS "customFieldsMlembedding" text;
          ALTER TABLE "product"
            ADD COLUMN IF NOT EXISTS "customFieldsMlembeddingversion" character varying(255);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'product'
        ) THEN
          ALTER TABLE "product" DROP COLUMN IF EXISTS "customFieldsMlembedding";
          ALTER TABLE "product" DROP COLUMN IF EXISTS "customFieldsMlembeddingversion";
        END IF;
      END $$;
    `);
  }
}
