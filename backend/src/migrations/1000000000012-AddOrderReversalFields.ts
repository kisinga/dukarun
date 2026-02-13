import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Order reversal custom fields and FK.
 *
 * Final state:
 * - Order: reversedAt (datetime), reversedByUserId (relation to User)
 * - FK on customFieldsReversedbyuseridid -> user(id) with exact name TypeORM expects.
 */
export class AddOrderReversalFields1000000000012 implements MigrationInterface {
  name = 'AddOrderReversalFields1000000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'order'
                ) THEN
                    ALTER TABLE "order" 
                    ADD COLUMN IF NOT EXISTS "customFieldsReversedat" timestamp;

                    ALTER TABLE "order" 
                    ADD COLUMN IF NOT EXISTS "customFieldsReversedbyuseridid" integer;

                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_bd985a8231f658770d49ab02a6f') THEN
                        ALTER TABLE "order"
                        ADD CONSTRAINT "FK_bd985a8231f658770d49ab02a6f"
                        FOREIGN KEY ("customFieldsReversedbyuseridid")
                        REFERENCES "user"("id")
                        ON DELETE NO ACTION
                        ON UPDATE NO ACTION;
                    END IF;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'order'
                ) THEN
                    ALTER TABLE "order" DROP CONSTRAINT IF EXISTS "FK_bd985a8231f658770d49ab02a6f";
                    ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsReversedat";
                    ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsReversedbyuseridid";
                END IF;
            END $$;
        `);
  }
}
