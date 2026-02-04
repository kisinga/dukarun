import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { RoleTemplate } from './role-template.entity';

/**
 * Links a Vendure Role to a RoleTemplate (roleId -> templateId).
 * Used for find-or-create by (channel, template) and future template sync.
 * One-to-one per role: custom/override roles have no row here.
 */
@Entity('role_template_assignment')
export class RoleTemplateAssignment {
  @PrimaryColumn('int', { name: 'roleId' })
  roleId: number;

  @Column('uuid', { name: 'templateId' })
  templateId: string;

  @ManyToOne(() => RoleTemplate, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'templateId' })
  template: RoleTemplate;
}
