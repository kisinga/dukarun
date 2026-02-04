import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align role_template_assignment constraints and indexes with TypeORM's expected schema.
 *
 * Migration 9000000000007 created the table with human-readable constraint/index names.
 * TypeORM generates hashed FK names and only expects the relation declared on the entity
 * (@ManyToOne to RoleTemplate). This migration drops legacy names and adds the hashed FK
 * so "schema does not match" no longer appears at startup.
 *
 * See docs/VENDURE_CUSTOM_FIELDS.md §3.2 and troubleshooting; docs/COMPANY_ADMINS.md.
 */
export class AlignRoleTemplateAssignmentConstraints9000000000008 implements MigrationInterface {
  name = 'AlignRoleTemplateAssignmentConstraints9000000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Only run if table exists (migration 9000000000007 already applied)
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'role_template_assignment'
        ) THEN
          -- Drop legacy FK constraints (guarded; replays and envs may differ)
          ALTER TABLE "role_template_assignment" DROP CONSTRAINT IF EXISTS "FK_role_template_assignment_template";
          ALTER TABLE "role_template_assignment" DROP CONSTRAINT IF EXISTS "FK_role_template_assignment_role";

          -- Drop legacy indexes (created as separate indexes in 9000000000007)
          DROP INDEX IF EXISTS "UQ_role_template_assignment_roleId";
          DROP INDEX IF EXISTS "IDX_role_template_assignment_templateId";

          -- Add TypeORM-expected hashed FK (templateId -> role_template.id) if missing
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class rel ON rel.oid = c.conrelid
            JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE c.conname = 'FK_3cd36b6e034a8a3a1588b85e9f2'
              AND nsp.nspname = current_schema()
              AND rel.relname = 'role_template_assignment'
          ) THEN
            ALTER TABLE "role_template_assignment"
              ADD CONSTRAINT "FK_3cd36b6e034a8a3a1588b85e9f2"
              FOREIGN KEY ("templateId")
              REFERENCES "role_template"("id")
              ON DELETE RESTRICT
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
          SELECT 1 FROM information_schema.tables WHERE table_name = 'role_template_assignment'
        ) THEN
          ALTER TABLE "role_template_assignment" DROP CONSTRAINT IF EXISTS "FK_3cd36b6e034a8a3a1588b85e9f2";
        END IF;
      END $$;
    `);
  }
}
