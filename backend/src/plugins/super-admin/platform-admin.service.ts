import { Injectable, NotFoundException } from '@nestjs/common';
import { Administrator, RequestContext, TransactionalConnection, User } from '@vendure/core';

export interface PlatformAdministratorDto {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  userId: string;
  identifier: string;
  authorizationStatus: string;
  roleCodes: string[];
  channelIds?: string[];
  isSuperAdmin?: boolean;
}

export interface PlatformAdministratorRoleDetail {
  id: string;
  code: string;
  channelIds: string[];
  permissions: string[];
}

export interface PlatformAdministratorDetailDto {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  userId: string;
  identifier: string;
  authorizationStatus: string;
  isSuperAdmin: boolean;
  roles: PlatformAdministratorRoleDetail[];
}

export interface PlatformAdministratorListOptions {
  skip?: number;
  take?: number;
  channelId?: string;
  superAdminOnly?: boolean;
}

@Injectable()
export class PlatformAdminService {
  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Get all administrators for a given channel (channel-scoped only; excludes superadmins).
   * Normalizes channelId to number so the TypeORM query matches Vendure's integer channel.id in the DB.
   */
  async getAdministratorsForChannel(channelId: string): Promise<PlatformAdministratorDto[]> {
    const channelIdNum = parseInt(channelId, 10);
    if (Number.isNaN(channelIdNum)) {
      return [];
    }

    const adminRepo = this.connection.rawConnection.getRepository(Administrator);
    const administrators = await adminRepo
      .createQueryBuilder('admin')
      .innerJoinAndSelect('admin.user', 'user')
      .innerJoinAndSelect('user.roles', 'role')
      .innerJoinAndSelect('role.channels', 'channel')
      .where('channel.id = :channelId', { channelId: channelIdNum })
      .andWhere('user.deletedAt IS NULL')
      .getMany();

    const result: PlatformAdministratorDto[] = [];

    for (const admin of administrators) {
      const user = admin.user as User & {
        roles?: Array<{ code: string; channels?: Array<{ id: number | string }> }>;
      };
      if (!user) continue;

      const roles = user.roles ?? [];
      const channelRoles = roles.filter(
        r =>
          r.channels?.length &&
          r.channels.some(c =>
            typeof c.id === 'number'
              ? c.id === channelIdNum
              : parseInt(String(c.id), 10) === channelIdNum
          )
      );
      if (channelRoles.length === 0) continue;

      const customFields = (user.customFields ?? {}) as Record<string, unknown>;
      const authorizationStatus = (customFields.authorizationStatus as string) ?? 'PENDING';

      result.push({
        id: admin.id.toString(),
        firstName: admin.firstName ?? '',
        lastName: admin.lastName ?? '',
        emailAddress: admin.emailAddress ?? '',
        userId: user.id.toString(),
        identifier: user.identifier ?? '',
        authorizationStatus,
        roleCodes: channelRoles.map(r => r.code ?? '').filter(Boolean),
        channelIds: channelRoles.flatMap(r => (r.channels ?? []).map(c => c.id.toString())),
        isSuperAdmin: false,
      });
    }

    return result;
  }

  /**
   * Get all platform administrators with optional filters and pagination.
   */
  async getPlatformAdministrators(
    options: PlatformAdministratorListOptions = {}
  ): Promise<{ items: PlatformAdministratorDto[]; totalItems: number }> {
    const { skip = 0, take = 50, channelId, superAdminOnly = false } = options;
    const adminRepo = this.connection.rawConnection.getRepository(Administrator);

    const allAdmins = await adminRepo
      .createQueryBuilder('admin')
      .innerJoinAndSelect('admin.user', 'user')
      .innerJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.channels', 'channel')
      .where('user.deletedAt IS NULL')
      .orderBy('admin.id', 'ASC')
      .getMany();

    const dtos: PlatformAdministratorDto[] = [];
    const processed = new Set<string>();

    for (const admin of allAdmins) {
      const user = admin.user as User & {
        roles?: Array<{ code: string; channels?: Array<{ id: number | string }> }>;
      };
      if (!user) continue;

      const roles = user.roles ?? [];
      const isSuperAdmin = roles.some(r => !r.channels || r.channels.length === 0);
      const channelIds = new Set<string>();
      const channelRoleCodes: string[] = [];
      for (const r of roles) {
        if (r.channels?.length) {
          for (const c of r.channels) {
            channelIds.add(c.id.toString());
          }
          if (channelId && channelIds.has(channelId)) {
            channelRoleCodes.push(r.code ?? '');
          }
        } else {
          channelRoleCodes.push(r.code ?? '');
        }
      }

      if (superAdminOnly && !isSuperAdmin) continue;
      if (channelId && !channelIds.has(channelId) && !isSuperAdmin) continue;

      const adminKey = admin.id.toString();
      if (processed.has(adminKey)) continue;
      processed.add(adminKey);

      const customFields = (user.customFields ?? {}) as Record<string, unknown>;
      const authorizationStatus = (customFields.authorizationStatus as string) ?? 'PENDING';

      const allChannelIds = Array.from(channelIds);
      dtos.push({
        id: admin.id.toString(),
        firstName: admin.firstName ?? '',
        lastName: admin.lastName ?? '',
        emailAddress: admin.emailAddress ?? '',
        userId: user.id.toString(),
        identifier: user.identifier ?? '',
        authorizationStatus,
        roleCodes: channelId ? channelRoleCodes : roles.map(r => r.code ?? '').filter(Boolean),
        channelIds: allChannelIds,
        isSuperAdmin,
      });
    }

    const totalItems = dtos.length;
    const items = dtos.slice(skip, skip + take);
    return { items, totalItems };
  }

  /**
   * Get a single administrator with full role details (id, code, channelIds, permissions) for editing.
   */
  async getAdministratorDetail(
    ctx: RequestContext,
    administratorId: string
  ): Promise<PlatformAdministratorDetailDto | null> {
    const adminRepo = this.connection.getRepository(ctx, Administrator);
    const admin = await adminRepo.findOne({
      where: { id: parseInt(administratorId, 10) },
      relations: ['user', 'user.roles', 'user.roles.channels'],
    });
    if (!admin?.user) return null;

    const user = admin.user as User & {
      roles?: Array<{
        id: number;
        code: string;
        permissions: string[];
        channels?: Array<{ id: number | string }>;
      }>;
    };
    const roles = user.roles ?? [];
    const isSuperAdmin = roles.some(r => !r.channels || r.channels.length === 0);
    const customFields = (user.customFields ?? {}) as Record<string, unknown>;
    const authorizationStatus = (customFields.authorizationStatus as string) ?? 'PENDING';

    return {
      id: admin.id.toString(),
      firstName: admin.firstName ?? '',
      lastName: admin.lastName ?? '',
      emailAddress: admin.emailAddress ?? '',
      userId: user.id.toString(),
      identifier: user.identifier ?? '',
      authorizationStatus,
      isSuperAdmin,
      roles: roles.map(r => ({
        id: String(r.id),
        code: r.code ?? '',
        channelIds: (r.channels ?? []).map(c => c.id.toString()),
        permissions: (r.permissions ?? []) as string[],
      })),
    };
  }
}
