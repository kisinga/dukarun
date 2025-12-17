import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { Request, Response } from 'express';
import gql from 'graphql-tag';
import { PhoneAuthService, RegistrationInput } from '../../services/auth/phone-auth.service';

// Common schema definitions
const commonSchemaDefs = `
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
    requestEmailRegistrationOTP(email: String!, registrationData: RegistrationInput!): OTPResponse!
    # UPDATED: Now uses sessionId instead of registrationData
    verifyRegistrationOTP(
      phoneNumber: String!
      otp: String!
      sessionId: String!
    ): RegistrationResult!
    verifyEmailRegistrationOTP(
      email: String!
      otp: String!
      sessionId: String!
    ): RegistrationResult!
    requestLoginOTP(phoneNumber: String!): OTPResponse!
    verifyLoginOTP(phoneNumber: String!, otp: String!): LoginResult!
    # Request OTP for updating email or phone number (requires authenticated user)
    requestUpdateOTP(identifier: String!): OTPResponse!
  }

  extend type Query {
    checkAuthorizationStatus(identifier: String!): AuthorizationStatus!
    checkCompanyCodeAvailability(companyCode: String!): Boolean!
    # Check if email or phone is available (not already used by another user)
    checkIdentifierAvailable(identifier: String!): Boolean!
  }
`;

// Admin-specific definitions
const adminSchemaDefs = `
  input UpdateAdminProfileInput {
    firstName: String!
    lastName: String!
    email: String!
    profilePictureId: ID
  }

  extend type Mutation {
    # Update admin profile without changing user identifier
    updateAdminProfile(input: UpdateAdminProfileInput!): Administrator!
  }
`;

export const phoneAuthShopSchema = gql(commonSchemaDefs);

// Explicitly combining to avoid multiple "extend type Mutation" blocks issues
export const phoneAuthAdminSchema = gql`
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

  input UpdateAdminProfileInput {
    firstName: String!
    lastName: String!
    email: String!
    profilePictureId: ID
  }

  extend type Mutation {
    # NEW: Store registration data and request OTP
    # Returns sessionId that must be used during verification
    requestRegistrationOTP(phoneNumber: String!, registrationData: RegistrationInput!): OTPResponse!
    requestEmailRegistrationOTP(email: String!, registrationData: RegistrationInput!): OTPResponse!
    # UPDATED: Now uses sessionId instead of registrationData
    verifyRegistrationOTP(
      phoneNumber: String!
      otp: String!
      sessionId: String!
    ): RegistrationResult!
    verifyEmailRegistrationOTP(
      email: String!
      otp: String!
      sessionId: String!
    ): RegistrationResult!
    requestLoginOTP(phoneNumber: String!): OTPResponse!
    verifyLoginOTP(phoneNumber: String!, otp: String!): LoginResult!
    # Request OTP for updating email or phone number (requires authenticated user)
    requestUpdateOTP(identifier: String!): OTPResponse!
    # Update admin profile without changing user identifier
    updateAdminProfile(input: UpdateAdminProfileInput!): Boolean!
  }

  extend type Query {
    checkAuthorizationStatus(identifier: String!): AuthorizationStatus!
    checkCompanyCodeAvailability(companyCode: String!): Boolean!
    # Check if email or phone is available (not already used by another user)
    checkIdentifierAvailable(identifier: String!): Boolean!
  }
`;

@Resolver()
export class PhoneAuthCommonResolver {
  constructor(private phoneAuthService: PhoneAuthService) {}

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
  async requestEmailRegistrationOTP(
    @Ctx() ctx: RequestContext,
    @Args('email') email: string,
    @Args('registrationData') registrationData: RegistrationInput
  ) {
    return this.phoneAuthService.requestEmailRegistrationOTP(email, registrationData);
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
  async verifyEmailRegistrationOTP(
    @Ctx() ctx: RequestContext,
    @Args('email') email: string,
    @Args('otp') otp: string,
    @Args('sessionId') sessionId: string
  ) {
    return this.phoneAuthService.verifyEmailRegistrationOTP(ctx, email, otp, sessionId);
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

  @Mutation()
  @Allow(Permission.Authenticated)
  async requestUpdateOTP(@Ctx() ctx: RequestContext, @Args('identifier') identifier: string) {
    return this.phoneAuthService.requestUpdateOTP(ctx, identifier);
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

  @Query()
  @Allow(Permission.Authenticated)
  async checkIdentifierAvailable(
    @Ctx() ctx: RequestContext,
    @Args('identifier') identifier: string
  ): Promise<boolean> {
    return this.phoneAuthService.checkIdentifierAvailable(ctx, identifier);
  }
}

@Resolver()
export class PhoneAuthAdminResolver {
  constructor(private phoneAuthService: PhoneAuthService) {}

  @Mutation()
  @Allow(Permission.Authenticated)
  async updateAdminProfile(
    @Ctx() ctx: RequestContext,
    @Args('input')
    input: { firstName: string; lastName: string; email: string; profilePictureId?: string }
  ) {
    await this.phoneAuthService.updateAdminProfile(ctx, input);
    return true;
  }
}
