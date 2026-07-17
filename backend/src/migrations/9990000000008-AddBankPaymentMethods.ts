import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Bank Transfer payment methods for all existing channels.
 *
 * Context: bank transfer support was added as a new payment method handler. New channels
 * already get a bank method via PaymentProvisionerService, but existing channels need
 * one created. This migration is idempotent: it skips any channel that already has a
 * payment method whose handler code is 'bank'.
 *
 * Notes on column types:
 * - Vendure stores `payment_method.handler` as a text/simple-json column, so JSON
 *   operators are not available directly; cast to jsonb when querying.
 * - `payment_method.id` and `payment_method_translation.id` are auto-increment integers;
 *   we let the sequences generate them and capture the new IDs with RETURNING.
 * - `down` removes only rows stamped with this migration's name in the handler JSON,
 *   so pre-existing or later-provisioned bank methods are never touched.
 */
export class AddBankPaymentMethods9990000000008 implements MigrationInterface {
  name = 'AddBankPaymentMethods9990000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        channel_record RECORD;
        new_payment_method_id INTEGER;
      BEGIN
        FOR channel_record IN
          SELECT id FROM channel ORDER BY id
        LOOP
          -- Skip if this channel already has a bank payment method
          IF EXISTS (
            SELECT 1
            FROM payment_method pm
            JOIN payment_method_channels_channel pmc ON pmc."paymentMethodId" = pm.id
            WHERE pmc."channelId" = channel_record.id
              AND (pm.handler::jsonb ->> 'code') = 'bank'
          ) THEN
            CONTINUE;
          END IF;

          INSERT INTO payment_method (
            "createdAt",
            "updatedAt",
            code,
            enabled,
            checker,
            handler,
            "customFieldsIsactive",
            "customFieldsReconciliationtype",
            "customFieldsLedgeraccountcode",
            "customFieldsIscashiercontrolled",
            "customFieldsRequiresreconciliation"
          )
          VALUES (
            NOW(),
            NOW(),
            'bank-' || channel_record.id::text,
            true,
            NULL,
            '{"code":"bank","arguments":[],"__migratedBy":"AddBankPaymentMethods9990000000008"}',
            true,
            'statement_match',
            'BANK_MAIN',
            false,
            true
          )
          RETURNING id INTO new_payment_method_id;

          INSERT INTO payment_method_translation (
            "createdAt",
            "updatedAt",
            "baseId",
            "languageCode",
            name,
            description
          )
          VALUES (
            NOW(),
            NOW(),
            new_payment_method_id,
            'en',
            'Bank Transfer',
            'Bank Transfer - Recorded for statement reconciliation'
          );

          INSERT INTO payment_method_channels_channel ("paymentMethodId", "channelId")
          VALUES (new_payment_method_id, channel_record.id);
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM payment_method_channels_channel
      WHERE "paymentMethodId" IN (
        SELECT id
        FROM payment_method
        WHERE (handler::jsonb ->> '__migratedBy') = 'AddBankPaymentMethods9990000000008'
      );
    `);

    await queryRunner.query(`
      DELETE FROM payment_method_translation
      WHERE "baseId" IN (
        SELECT id
        FROM payment_method
        WHERE (handler::jsonb ->> '__migratedBy') = 'AddBankPaymentMethods9990000000008'
      );
    `);

    await queryRunner.query(`
      DELETE FROM payment_method
      WHERE (handler::jsonb ->> '__migratedBy') = 'AddBankPaymentMethods9990000000008';
    `);
  }
}
