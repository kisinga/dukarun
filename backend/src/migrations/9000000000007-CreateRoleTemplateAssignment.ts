import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create role_template_assignment table: links Role to RoleTemplate (roleId -> templateId).
 * Used for find-or-create by (channel, template) and future template sync.
 * One-to-one: each role has at most one template (custom/override roles have no row).
 *
 * Standalone table (not Vendure config.customFields — Role has no custom fields).
 * Follows docs/VENDURE_CUSTOM_FIELDS.md: idempotent, guarded, build-before-run.
 * FK actions: CASCADE on role (assignment goes with role); RESTRICT on template.
 */
export class CreateRoleTemplateAssignment9000000000007 implements MigrationInterface {
  name = 'CreateRoleTemplateAssignment9000000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'role_template_assignment'
        ) THEN
          CREATE TABLE "role_template_assignment" (
            "roleId" integer NOT NULL,
            "templateId" uuid NOT NULL,
            CONSTRAINT "PK_role_template_assignment" PRIMARY KEY ("roleId"),
            CONSTRAINT "FK_role_template_assignment_role" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_role_template_assignment_template" FOREIGN KEY ("templateId") REFERENCES "role_template"("id") ON DELETE RESTRICT
          );
          CREATE UNIQUE INDEX "UQ_role_template_assignment_roleId" ON "role_template_assignment" ("roleId");
          CREATE INDEX "IDX_role_template_assignment_templateId" ON "role_template_assignment" ("templateId");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_template_assignment"`);
  }
}
