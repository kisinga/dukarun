import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { RequestContext, TransactionalConnection, Administrator } from '@vendure/core';
import { env } from '../../infrastructure/config/environment.config';

/**
 * Service Token Authentication Guard
 *
 * Validates ML_SERVICE_TOKEN from Authorization header for service-to-service calls.
 * When valid, modifies RequestContext to have superadmin permissions by finding
 * a superadmin user and setting it in the context.
 *
 * This guard should be applied BEFORE @Allow decorator so it can modify the context
 * before permission checks run.
 */
@Injectable()
export class MlServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(MlServiceAuthGuard.name);
  private superAdminCache: any = null;

  constructor(private connection: TransactionalConnection) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext();
    const req = ctx.req || ctx.request;

    if (!req) {
      return false;
    }

    // Extract Authorization header
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth header - let other guards handle it (normal user auth)
      return true;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    const expectedToken = env.ml.serviceToken;

    if (!expectedToken) {
      this.logger.warn('ML_SERVICE_TOKEN not configured in environment');
      return false;
    }

    if (token !== expectedToken) {
      // Token doesn't match - let other guards handle it
      return true;
    }

    // Valid service token - modify RequestContext to have superadmin permissions
    try {
      const requestContext = ctx.req as RequestContext;
      const superAdmin = await this.findSuperAdmin(requestContext);

      if (superAdmin && superAdmin.user) {
        // Modify the existing RequestContext to use superadmin user
        // RequestContext properties can be modified to grant permissions
        (requestContext as any).activeUserId = superAdmin.user.id;
        (requestContext as any).user = superAdmin.user;
        (requestContext as any).isAuthorized = true;
        (requestContext as any).authorizedAsOwnerOnly = false;

        this.logger.debug('Service token authenticated - using superadmin context');
        return true;
      } else {
        this.logger.warn('Service token valid but could not find superadmin user');
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error in service auth guard: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Find a superadmin user (user with global role, not channel-scoped)
   * Caches the result to avoid repeated queries
   */
  private async findSuperAdmin(ctx: RequestContext): Promise<any> {
    if (this.superAdminCache) {
      return this.superAdminCache;
    }

    try {
      const adminRepo = this.connection.getRepository(ctx, Administrator);
      const administrators = await adminRepo
        .createQueryBuilder('admin')
        .innerJoinAndSelect('admin.user', 'user')
        .innerJoinAndSelect('user.roles', 'role')
        .leftJoin('role.channels', 'channel')
        .where('user.deletedAt IS NULL')
        .getMany();

      // Find admin with role that has no channels (global/superadmin role)
      for (const admin of administrators) {
        const user = (admin as any).user;
        if (user?.roles) {
          for (const role of user.roles) {
            if (!role.channels || role.channels.length === 0) {
              this.superAdminCache = admin;
              return admin;
            }
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error finding superadmin: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }
}
