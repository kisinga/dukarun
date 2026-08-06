import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePushSubscriptionEntity5000000000001 implements MigrationInterface {
  name = 'CreatePushSubscriptionEntity5000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Use IF NOT EXISTS for idempotency as per Migration Guidelines
    await queryRunner.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_name = 'push_subscription'
          ) THEN
              CREATE TABLE "push_subscription" (
                  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                  "userId" character varying NOT NULL,
                  "channelId" character varying NOT NULL,
                  "endpoint" text NOT NULL,
                  "keys" jsonb NOT NULL,
                  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                  CONSTRAINT "PK_push_subscription" PRIMARY KEY ("id")
              );
          END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscription"`);
  }
}
