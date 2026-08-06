import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Notification Entity
 *
 * Merges:
 * - 1761700000000-AddNotificationEntity.ts
 *
 * Final state:
 * - notification table with createdAt (keeping functional timestamp)
 * - notification_type_enum type
 */
export class CreateNotificationEntity5000000000000 implements MigrationInterface {
  name = 'CreateNotificationEntity5000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type
    await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum'
                ) THEN
                    CREATE TYPE "public"."notification_type_enum" AS ENUM('order', 'stock', 'ml_training', 'payment');
                END IF;
            END $$;
        `);

    // Create notification table
    await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'notification'
                ) THEN
                    CREATE TABLE "notification" (
                        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                        "userId" character varying NOT NULL,
                        "channelId" character varying NOT NULL,
                        "type" "public"."notification_type_enum" NOT NULL,
                        "title" character varying NOT NULL,
                        "message" character varying NOT NULL,
                        "data" jsonb,
                        "read" boolean NOT NULL DEFAULT false,
                        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                        CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id")
                    );
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_type_enum"`);
  }
}
