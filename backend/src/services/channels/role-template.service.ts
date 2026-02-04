import { Injectable } from '@nestjs/common';
import { RequestContext, Role, TransactionalConnection } from '@vendure/core';
import { RoleTemplate } from '../../domain/role-template/role-template.entity';
import { RoleTemplateAssignment } from '../../domain/role-template/role-template-assignment.entity';

/**
 * Resolves role templates from DB and role–template assignment.
 * Single source of truth for template-by-code and find-or-create role lookup.
 */
@Injectable()
export class RoleTemplateService {
  constructor(private readonly connection: TransactionalConnection) {}

  async getTemplateByCode(ctx: RequestContext, code: string): Promise<RoleTemplate | null> {
    const repo = this.connection.getRepository(ctx, RoleTemplate);
    const template = await repo.findOne({ where: { code } });
    return template ?? null;
  }

  async getTemplateById(ctx: RequestContext, id: string): Promise<RoleTemplate | null> {
    const repo = this.connection.getRepository(ctx, RoleTemplate);
    const template = await repo.findOne({ where: { id } });
    return template ?? null;
  }

  /**
   * Find a role that is assigned to the given channel and linked to the given template.
   * Returns the Role entity or null.
   */
  async findRoleByChannelAndTemplateId(
    ctx: RequestContext,
    channelId: string | number,
    templateId: string
  ): Promise<Role | null> {
    const roleRepo = this.connection.getRepository(ctx, Role);
    const qb = roleRepo
      .createQueryBuilder('role')
      .innerJoin('role_template_assignment', 'rta', 'rta."roleId" = role.id')
      .innerJoin('role_channels_channel', 'rcc', 'rcc."roleId" = role.id')
      .where('rta."templateId" = :templateId', { templateId })
      .andWhere('rcc."channelId" = :channelId', { channelId })
      .select('role.id')
      .limit(1);

    const result = await qb.getRawOne<{ role_id: number }>();
    if (!result) return null;
    const role = await roleRepo.findOne({
      where: { id: result.role_id },
      relations: ['channels'],
    });
    return role ?? null;
  }

  /**
   * Link a role to a template. Idempotent: replaces any existing assignment for the role.
   */
  async assignTemplateToRole(
    ctx: RequestContext,
    roleId: number,
    templateId: string
  ): Promise<void> {
    const repo = this.connection.getRepository(ctx, RoleTemplateAssignment);
    await repo.upsert({ roleId, templateId }, { conflictPaths: ['roleId'] });
  }

  /**
   * Remove template link from a role (for custom/override roles).
   */
  async unassignTemplateFromRole(ctx: RequestContext, roleId: number): Promise<void> {
    const repo = this.connection.getRepository(ctx, RoleTemplateAssignment);
    await repo.delete({ roleId });
  }

  async getAllTemplates(ctx: RequestContext): Promise<RoleTemplate[]> {
    const repo = this.connection.getRepository(ctx, RoleTemplate);
    return repo.find({ order: { code: 'ASC' } });
  }
}
