# M-Pesa Integration: Permissions & Implementation Guide

## Overview

Enable M-Pesa STK push requests and payment webhooks on behalf of clients who own Till/Paybill numbers. Funds remain in client accounts; you act as technical facilitator.

## Legal Requirements

### 1. Client Authorization (Required)

- **Agency/Service Agreement**: Client authorizes you to:
  - Initiate STK push requests
  - Receive payment webhooks
  - Access M-Pesa API credentials
- **Written Consent**: Signed authorization form
- **Key Clauses**: Fund handling (client retains control), data privacy, liability limits, termination

### 2. Data Protection Act Compliance (Required)

- **ODPC Registration**: Register as data processor with Office of Data Protection Commissioner
  - Application fee: KES 2,000
  - Required: Business registration, data protection policy, security measures
- **Data Protection Policy**: Document data handling, security, retention, subject rights
- **Security Measures**: Encryption, access controls, audit logs

### 3. Regulatory Compliance

- **CBK Licensing**: Not required (you don't handle funds)
  - Verify with legal counsel to confirm
- **AML/KYC**: Client identity verification, transaction monitoring
- **Safaricom Terms**: Review M-Pesa Access Channels Terms & Conditions

## Technical Implementation

### Credential Management

- Store per-client credentials (Consumer Key, Secret, Passkey) encrypted
- Link credentials to channel via `channelId`
- Secure key management (AWS KMS, Vault, or similar)

### STK Push Flow

1. Receive order payment request
2. Retrieve client's M-Pesa credentials
3. Call Daraja API STK Push endpoint
4. Set payment state to `Pending`
5. Await webhook callback

### Webhook Handler

- Endpoint: `/api/webhooks/mpesa/:channelId`
- Verify webhook authenticity (signature if available)
- Match webhook to payment via `CheckoutRequestID`
- Update payment state: `Settled` (success) or `Cancelled` (failure)
- Implement idempotency to prevent duplicate processing

### Payment Handler Updates

- Replace stub in `payment-handlers.ts` with real STK push
- Async flow: `Pending` → `Settled`/`Cancelled` on webhook
- Link webhook to payment for status updates

## Implementation Steps

### Phase 1: Legal Setup (Weeks 1-4)

1. Engage legal counsel (financial services, data protection)
2. Draft agency/service agreement template
3. Register with ODPC as data processor
4. Create data protection policy
5. Review Safaricom terms

### Phase 2: Technical Build (Weeks 5-8)

1. Design credential storage (encrypted, per-client)
2. Implement STK push service (Daraja API)
3. Build webhook handler with security
4. Update payment handler (async flow)
5. Add transaction logging and monitoring

### Phase 3: Client Onboarding (Weeks 9-10)

1. Client signs agreement and consent
2. Client provides API credentials
3. Test in sandbox environment
4. Validate production credentials
5. Go-live with monitoring

### Phase 4: Operations (Ongoing)

1. Monitor transaction success rates
2. Maintain audit logs
3. Regular compliance reviews
4. Client support and reporting

## Required Credentials Per Client

- Consumer Key (from Safaricom)
- Consumer Secret (from Safaricom)
- Passkey (for STK push)
- Till/Paybill number (shortcode)
- Callback URL (your webhook endpoint)

## Security Requirements

- Encrypt credentials at rest (AES-256)
- Secure key management system
- HTTPS for all API calls
- Webhook signature verification
- Access controls and audit logging
- Rate limiting on webhook endpoint

## Compliance Checklist

- [ ] Agency/service agreement template
- [ ] ODPC registration completed
- [ ] Data protection policy in place
- [ ] Safaricom terms reviewed
- [ ] CBK licensing confirmed (not required)
- [ ] Client onboarding process documented
- [ ] Security measures implemented
- [ ] Monitoring and audit systems ready

## Risk Mitigation

- **Credential Compromise**: Encryption, access controls, rotation
- **Webhook Failures**: Retry logic, monitoring, manual reconciliation
- **Disputes**: Clear agreements, detailed logging
- **Regulatory Changes**: Legal monitoring, compliance reviews
- **Data Breaches**: Security measures, incident response plan

## Timeline

- **Weeks 1-4**: Legal & regulatory compliance
- **Weeks 5-8**: Technical implementation
- **Weeks 9-10**: Pilot client onboarding
- **Week 11+**: Production rollout

## Resources

- Safaricom Daraja API: https://developer.safaricom.co.ke
- ODPC: https://www.odpc.go.ke
- CBK: https://www.centralbank.go.ke
