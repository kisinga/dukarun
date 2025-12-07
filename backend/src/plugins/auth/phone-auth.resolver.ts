import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { Request, Response } from 'express';
import gql from 'graphql-tag';
import { PhoneAuthService, RegistrationInput } from '../../services/auth/phone-auth.service';

export const phoneAuthSchema = gql`
  type OTPResponse {
    success: Boolean!
    message: String!
    sessionId: String # Session ID for retrieving stored registration data
    expiresAt: Int
  }

  type RegistrationResult {
    success: Boolean!
    userId: ID
    message: String!
  }

  type LoginResult {
    success: Boolean!
    token: String
    user: UserInfo
    message: String!
    authorizationStatus: String # Status: PENDING, APPROVED, REJECTED - channel must be APPROVED before login succeeds
  }

  type UserInfo {
    id: ID!
    identifier: String!
  }

  type AuthorizationStatus {
    status: String!
    message: String!
  }

  input RegistrationInput {
    companyName: String!
    # companyCode is NOT part of input - always generated from companyName by backend
    currency: String!
    adminFirstName: String!
    adminLastName: String!
    adminPhoneNumber: String!
    adminEmail: String
    storeName: String!
    storeAddress: String!
  }

  extend type Mutation {
    # NEW: Store registration data and request OTP
    # Returns sessionId that must be used during verification
    requestRegistrationOTP(phoneNumber: String!, registrationData: RegistrationInput!): OTPResponse!
    # UPDATED: Now uses sessionId instead of registrationData
    verifyRegistrationOTP(
      phoneNumber: String!
      otp: String!
      sessionId: String!
    ): RegistrationResult!
    requestLoginOTP(phoneNumber: String!): OTPResponse!
    verifyLoginOTP(phoneNumber: String!, otp: String!): LoginResult!
  }

  extend type Query {
    checkAuthorizationStatus(identifier: String!): AuthorizationStatus!
    checkCompanyCodeAvailability(companyCode: String!): Boolean!
  }
`;

@Resolver()
export class PhoneAuthResolver {
  constructor(private phoneAuthService: PhoneAuthService) { }

  // Helper to get Request/Response from context
  private getRequestFromContext(ctx: RequestContext): { req: Request; res: Response } | null {
    // RequestContext should have req/res, but accessing them requires checking
    // In Vendure, these are typically available through the GraphQL context
    // For now, we'll need to pass them through the resolver method
    return null;
  }

  @Mutation()
  @Allow(Permission.Public)
  async requestRegistrationOTP(
    @Ctx() ctx: RequestContext,
    @Args('phoneNumber') phoneNumber: string,
    @Args('registrationData') registrationData: RegistrationInput
  ) {
    return this.phoneAuthService.requestRegistrationOTP(phoneNumber, registrationData);
  }

  @Mutation()
  @Allow(Permission.Public)
  async verifyRegistrationOTP(
    @Ctx() ctx: RequestContext,
    @Args('phoneNumber') phoneNumber: string,
    @Args('otp') otp: string,
    @Args('sessionId') sessionId: string
  ) {
    return this.phoneAuthService.verifyRegistrationOTP(ctx, phoneNumber, otp, sessionId);
  }

  @Mutation()
  @Allow(Permission.Public)
  async requestLoginOTP(@Ctx() ctx: RequestContext, @Args('phoneNumber') phoneNumber: string) {
    return this.phoneAuthService.requestLoginOTP(phoneNumber, ctx);
  }

  @Mutation()
  @Allow(Permission.Public)
  async verifyLoginOTP(
    @Ctx() ctx: RequestContext,
    @Args('phoneNumber') phoneNumber: string,
    @Args('otp') otp: string
  ) {
    return this.phoneAuthService.verifyLoginOTP(ctx, phoneNumber, otp.trim());
  }

  @Query()
  @Allow(Permission.Public)
  async checkAuthorizationStatus(
    @Ctx() ctx: RequestContext,
    @Args('identifier') identifier: string
  ) {
    return this.phoneAuthService.checkAuthorizationStatus(identifier);
  }

  @Query()
  @Allow(Permission.Public)
  async checkCompanyCodeAvailability(
    @Ctx() ctx: RequestContext,
    @Args('companyCode') companyCode: string
  ): Promise<boolean> {
    return this.phoneAuthService.checkCompanyCodeAvailability(ctx, companyCode);
  }
}
