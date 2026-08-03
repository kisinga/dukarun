import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import { formatPhoneNumber, toInternationalFormat } from '../../utils/phone.utils';

export interface PaystackTransactionResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackChargeResponse {
  status: boolean;
  message: string;
  data: {
    status: string;
    reference: string;
    amount: number;
    channel: string;
    customer: {
      id: number;
      customer_code: string;
      email: string;
      phone: string;
      metadata?: any;
    };
    authorization: {
      authorization_code: string;
      channel: string;
    };
    metadata?: any;
    paid_at?: string;
  };
}

export interface PaystackSubscriptionResponse {
  status: boolean;
  message: string;
  data: {
    subscription_code: string;
    email_token: string;
    amount: number;
    cron_expression: string;
    next_payment_date: string;
    open_invoice?: string;
    status: string;
  };
}

export interface PaystackCustomerResponse {
  status: boolean;
  message: string;
  data: {
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    customer_code: string;
    metadata: any;
  };
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;
  private readonly publicKey: string;

  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY || '';

    if (!this.secretKey || this.secretKey.trim() === '') {
      this.logger.error(
        'PAYSTACK_SECRET_KEY is not set or is empty. Paystack API requests will fail. Please set PAYSTACK_SECRET_KEY in your environment variables.'
      );
    } else if (!this.secretKey.startsWith('sk_test_') && !this.secretKey.startsWith('sk_live_')) {
      this.logger.warn(
        'PAYSTACK_SECRET_KEY does not appear to be in the correct format. Expected format: sk_test_xxx or sk_live_xxx'
      );
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: any,
    timeoutMs: number = 30000 // 30 seconds default timeout
  ): Promise<T> {
    // Validate secret key before making request
    if (!this.secretKey || this.secretKey.trim() === '') {
      const errorMessage =
        'PAYSTACK_SECRET_KEY is not set or is empty. Please configure the Paystack secret key in your environment variables.';
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      // Handle cases where Paystack returns 200 OK but with status: false
      // This happens with "Charge attempted" and similar scenarios
      if (!response.ok) {
        throw new Error(data.message || `Paystack API error: ${response.statusText}`);
      }

      // If response is OK but data.status is false, still throw error
      // This allows the caller to handle it (e.g., fallback to payment link)
      if (!data.status) {
        const errorMessage = data.message || 'Paystack API returned unsuccessful status';
        throw new Error(errorMessage);
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout specifically
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(`Paystack API request timed out after ${timeoutMs}ms`);
        this.logger.error(`Paystack API request timed out: ${endpoint}`);
        throw timeoutError;
      }

      // Handle other errors
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Only log errors (not warnings) - "Charge attempted" is expected and handled gracefully
      // The subscription service will log appropriate warnings when needed
      if (!errorMessage.includes('Charge attempted')) {
        this.logger.error(`Paystack API request failed: ${errorMessage} (endpoint: ${endpoint})`);
      }

      throw error;
    }
  }

  /**
   * Initialize a transaction (for payment links)
   */
  async initializeTransaction(
    amount: number,
    email: string,
    phone?: string,
    metadata?: Record<string, any>
  ): Promise<PaystackTransactionResponse> {
    const body: any = {
      amount: amount * 100, // Convert to kobo/cents
      email,
      currency: 'KES',
      metadata,
    };

    if (phone) {
      body.phone = phone;
    }

    return this.makeRequest<PaystackTransactionResponse>('/transaction/initialize', 'POST', body);
  }

  /**
   * Charge mobile money via STK push (mobile 07XXXXXXXX only; landlines not valid)
   */
  async chargeMobile(
    amount: number,
    phone: string,
    email: string,
    reference: string,
    metadata?: Record<string, any>
  ): Promise<PaystackChargeResponse> {
    const normalized = formatPhoneNumber(phone);
    const mobileMoneyPhone = '+' + toInternationalFormat(normalized);

    const body = {
      amount: amount * 100, // Convert to kobo/cents
      email,
      reference,
      currency: 'KES',
      mobile_money: {
        phone: mobileMoneyPhone, // Format: +254712345678 (with + sign)
        provider: 'mpesa', // M-Pesa for Kenya. Options: mpesa, atl (Airtel)
      },
      metadata,
    };

    return this.makeRequest<PaystackChargeResponse>('/charge', 'POST', body);
  }

  /**
   * Verify a transaction status
   */
  async verifyTransaction(reference: string): Promise<PaystackChargeResponse> {
    return this.makeRequest<PaystackChargeResponse>(`/transaction/verify/${reference}`);
  }

  /**
   * Create or get customer
   */
  async createCustomer(
    email: string,
    firstName?: string,
    lastName?: string,
    phone?: string,
    metadata?: Record<string, any>
  ): Promise<PaystackCustomerResponse> {
    const body: any = {
      email,
      metadata,
    };

    if (firstName) body.first_name = firstName;
    if (lastName) body.last_name = lastName;
    if (phone) body.phone = phone;

    return this.makeRequest<PaystackCustomerResponse>('/customer', 'POST', body);
  }

  /**
   * Get customer by code
   */
  async getCustomer(customerCode: string): Promise<PaystackCustomerResponse> {
    return this.makeRequest<PaystackCustomerResponse>(`/customer/${customerCode}`);
  }

  /**
   * Create subscription plan
   */
  async createPlan(
    name: string,
    amount: number,
    interval: 'daily' | 'weekly' | 'monthly' | 'annually',
    currency: string = 'KES'
  ): Promise<any> {
    const body = {
      name,
      amount: amount * 100, // Convert to kobo/cents
      interval,
      currency,
    };

    return this.makeRequest('/plan', 'POST', body);
  }

  /**
   * Initialize subscription
   */
  async initializeSubscription(
    customerEmail: string,
    planCode: string,
    authorizationCode?: string,
    startDate?: string
  ): Promise<PaystackSubscriptionResponse> {
    const body: any = {
      customer: customerEmail,
      plan: planCode,
    };

    if (authorizationCode) {
      body.authorization = authorizationCode;
    }

    if (startDate) {
      body.start_date = startDate;
    }

    return this.makeRequest<PaystackSubscriptionResponse>('/subscription', 'POST', body);
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionCode: string): Promise<PaystackSubscriptionResponse> {
    return this.makeRequest<PaystackSubscriptionResponse>(`/subscription/${subscriptionCode}`);
  }

  /**
   * Disable subscription
   */
  async disableSubscription(subscriptionCode: string, token: string): Promise<any> {
    return this.makeRequest(`/subscription/disable`, 'POST', {
      code: subscriptionCode,
      token,
    });
  }

  /**
   * Enable subscription
   */
  async enableSubscription(subscriptionCode: string, token: string): Promise<any> {
    return this.makeRequest(`/subscription/enable`, 'POST', {
      code: subscriptionCode,
      token,
    });
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    if (!process.env.PAYSTACK_WEBHOOK_SECRET) {
      this.logger.warn('PAYSTACK_WEBHOOK_SECRET not set. Webhook verification disabled.');
      return true; // Allow in development, but warn
    }

    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    return hash === signature;
  }

  getPublicKey(): string {
    return this.publicKey;
  }
}
