import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, Role, TransactionalConnection, User, Administrator } from '@vendure/core';

@Injectable()
export class ChannelUserService {
  private readonly logger = new Logger(ChannelUserService.name);

  constructor(private connection: TransactionalConnection) {}

  /**
   * Get all user IDs that have admin access to a channel.
   * This includes:
   * 1. Users with roles explicitly assigned to the channel AND have Administrator entity (not Customer)
   * 2. SuperAdmins (global roles) if includeSuperAdmins is true (default) AND have Administrator entity
   *
   * This method ensures we only return actual admin accounts, not customer users.
   */
  async getChannelAdminUserIds(
    ctx: RequestContext,
    channelId: string,
    options: { includeSuperAdmins?: boolean } = {}
  ): Promise<string[]> {
    const includeSuperAdmins = options.includeSuperAdmins ?? true;

    try {
      // 1. Find Administrators whose Users have Roles for this specific Channel
      // Query Administrator directly to ensure we only get admin accounts (not customers)
      // In Vendure, if a User has an Administrator entity, they're an admin (not a customer)
      // The innerJoin with role.channels and where clause ensures we only get admins
      // for the specific channelId, even if Vendure has a default channel or roles
      // are assigned to multiple channels
      // Use innerJoinAndSelect to load the user relation
      const administrators = await this.connection.rawConnection
        .getRepository(Administrator)
        .createQueryBuilder('administrator')
        .innerJoinAndSelect('administrator.user', 'user')
        .innerJoin('user.roles', 'role')
        .innerJoin('role.channels', 'channel')
        .where('channel.id = :channelId', { channelId })
        .andWhere('user.deletedAt IS NULL')
        .getMany();

      const userIds = new Set(
        administrators.map(a => a.user?.id?.toString()).filter(Boolean) as string[]
      );

      // 2. Find SuperAdmins (Administrators with roles not linked to any channel)
      // SuperAdmins have roles that are not linked to ANY channel (Global Roles)
      if (includeSuperAdmins) {
        const superAdmins = await this.connection.rawConnection
          .getRepository(Administrator)
          .createQueryBuilder('administrator')
          .innerJoinAndSelect('administrator.user', 'user')
          .innerJoin('user.roles', 'role')
          .leftJoin('role.channels', 'channel')
          .where('channel.id IS NULL')
          .andWhere('user.deletedAt IS NULL')
          .getMany();

        superAdmins.forEach(a => {
          if (a.user?.id) {
            userIds.add(a.user.id.toString());
          }
        });
      }

      return Array.from(userIds);
    } catch (error) {
      this.logger.error(
        `Failed to get channel admin users for channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      return [];
    }
  }
}
