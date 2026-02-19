import { BadRequestException, Injectable } from '@nestjs/common';
import { Administrator, TransactionalConnection, User } from '@vendure/core';
import { IsNull } from 'typeorm';

export interface PendingRegistrationDto {
  userId: string;
  identifier: string;
  createdAt: Date;
  administrator: {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
  };
}

@Injectable()
export class PendingRegistrationsService {
  constructor(private readonly connection: TransactionalConnection) {}

  async getPendingRegistrations(): Promise<PendingRegistrationDto[]> {
    const userRepo = this.connection.rawConnection.getRepository(User);
    const users = await userRepo.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const pending = users.filter(
      u => ((u.customFields ?? {}) as Record<string, string>).authorizationStatus === 'PENDING'
    );

    const result: PendingRegistrationDto[] = [];
    const adminRepo = this.connection.rawConnection.getRepository(Administrator);

    for (const user of pending) {
      const administrator = await adminRepo.findOne({
        where: { user: { id: user.id } },
        relations: ['user'],
      });
      if (!administrator) continue;

      result.push({
        userId: user.id.toString(),
        identifier: user.identifier ?? '',
        createdAt: user.createdAt ?? new Date(),
        administrator: {
          id: administrator.id.toString(),
          firstName: administrator.firstName ?? '',
          lastName: administrator.lastName ?? '',
          emailAddress: administrator.emailAddress ?? '',
        },
      });
    }

    return result;
  }

  async approveUser(userId: string): Promise<User> {
    const userRepo = this.connection.rawConnection.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId as any } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const cf = (user.customFields ?? {}) as Record<string, unknown>;
    const current = (cf.authorizationStatus as string) ?? 'PENDING';
    if (current !== 'PENDING') {
      throw new BadRequestException(`User is not pending (current: ${current})`);
    }
    (user.customFields as Record<string, unknown>) = { ...cf, authorizationStatus: 'APPROVED' };
    await userRepo.save(user);
    return user;
  }

  async rejectUser(userId: string, reason?: string): Promise<User> {
    const userRepo = this.connection.rawConnection.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId as any } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const cf = (user.customFields ?? {}) as Record<string, unknown>;
    const current = (cf.authorizationStatus as string) ?? 'PENDING';
    if (current !== 'PENDING') {
      throw new BadRequestException(`User is not pending (current: ${current})`);
    }
    const newCf: Record<string, unknown> = { ...cf, authorizationStatus: 'REJECTED' };
    if (reason != null) {
      newCf.rejectionReason = reason;
    }
    user.customFields = newCf as any;
    await userRepo.save(user);
    return user;
  }
}
