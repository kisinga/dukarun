export type MpesaCheckoutState =
  | 'created'
  | 'requesting'
  | 'pending'
  | 'funds_received'
  | 'awaiting_cash'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'failed'
  | 'manual_review';

export type MpesaCheckoutAction =
  'send_prompt' | 'poll' | 'await_cash' | 'completed' | 'review' | 'retryable';

export type MpesaCommissioningStage =
  | 'business_review'
  | 'merchant_verification'
  | 'daraja_connection'
  | 'credential_verification'
  | 'callback_registration'
  | 'ready_for_testing'
  | 'payment_testing'
  | 'activation_review'
  | 'live'
  | 'rejected'
  | 'cancelled';

export interface MpesaCommissioningStatus {
  request_id: string;
  status: string;
  stage: MpesaCommissioningStage;
  connection_id: string | null;
  allowed_actions: string[];
  blockers: string[];
  checks: {
    business_details: boolean;
    merchant_verified: boolean;
    connection_configured: boolean;
    production: boolean;
    credentials_verified: boolean;
    callbacks_registered: boolean;
    stk_test_passed: boolean;
    direct_payment_test_passed: boolean;
    active: boolean;
  };
}
