import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { BRAND_CONFIG } from '../../constants/brand.constants';

/**
 * Environment Configuration Service
 *
 * Centralized service for loading and accessing environment variables.
 * All environment variables are loaded once at application startup and
 * exposed through this service, eliminating scattered process.env references.
 *
 * This service must be initialized early in the application lifecycle.
 */
@Injectable()
export class EnvironmentConfig implements OnModuleInit {
  private readonly logger = new Logger(EnvironmentConfig.name);
  private static instance: EnvironmentConfig | null = null;
  private initialized = false;

  // Database configuration
  readonly db = {
    host: '',
    port: 5432,
    name: '',
    username: '',
    password: '',
    schema: 'public',
  };

  // Audit database configuration
  readonly auditDb = {
    host: '',
    port: 5432,
    name: '',
    username: '',
    password: '',
  };

  // Application configuration
  readonly app = {
    nodeEnv: 'development',
    port: 3000,
    corsOrigin: '',
    cookieSecret: '',
    cookieSecure: false,
    frontendUrl: '',
    assetUrlPrefix: '',
  };

  // Email configuration
  readonly email = {
    transport: 'file',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
  };

  // Redis configuration
  readonly redis = {
    host: '',
    port: 6379,
    password: '',
  };

  // SMS configuration
  readonly sms = {
    provider: '',
    africastalkingApiKey: '',
    africastalkingUsername: '',
    africastalkingSenderId: '',
    africastalkingEnvironment: '',
    africastalkingApiUrl: '',
    textsmsApiKey: '',
    textsmsPartnerId: '',
    textsmsShortcode: '',
  };

  // ML/Webhook configuration
  readonly ml = {
    webhookSecret: '',
    serviceToken: '', // Shared secret for service-to-service auth
    trainerUrl: 'http://ml-trainer:3005', // ML trainer service URL (uses Docker service name)
    backendInternalUrl: 'http://backend:3000', // Backend internal URL (uses Docker service name)
    trainingIntervalMinutes: 60,
    trainingCooldownHours: 4,
  };

  // Push notification configuration
  readonly push = {
    vapidPublicKey: '',
    vapidPrivateKey: '',
    vapidSubject: '',
  };

  // Paystack configuration
  readonly paystack = {
    secretKey: '',
    publicKey: '',
    systemEmail: '', // System email for all Paystack API calls (emails not mandatory for users)
  };

  // OTP configuration
  readonly otp = {
    redisHost: '',
    redisPort: 6379,
    redisPassword: '',
  };

  // Superadmin configuration
  readonly superadmin = {
    username: '',
    password: '',
  };

  // SigNoz/Observability configuration
  readonly observability = {
    enabled: false,
    endpoint: '',
    serviceName: `${BRAND_CONFIG.servicePrefix}-backend`,
    serviceVersion: '2.0.0',
    otlpGrpcEndpoint: '',
    otlpHttpEndpoint: '',
  };

  // Admin notification configuration (for platform-level alerts like new registrations)
  readonly adminNotifications = {
    email: '', // ADMIN_NOTIFICATION_EMAIL - receives registration alerts
    phone: '', // ADMIN_NOTIFICATION_PHONE - receives SMS alerts
    channels: 'email', // ADMIN_NOTIFICATION_CHANNELS - comma-separated: email,sms
  };

  /**
   * Get singleton instance (for use before DI container is ready)
   */
  static getInstance(): EnvironmentConfig {
    if (!EnvironmentConfig.instance) {
      EnvironmentConfig.instance = new EnvironmentConfig();
      EnvironmentConfig.instance.loadEnvironment();
    }
    return EnvironmentConfig.instance;
  }

  onModuleInit(): void {
    if (!this.initialized) {
      this.loadEnvironment();
      this.initialized = true;
      EnvironmentConfig.instance = this;
      this.logger.log('Environment configuration loaded');
    }
  }

  /**
   * Load environment variables from .env file
   * This is called early in the application lifecycle
   */
  private loadEnvironment(): void {
    // Try multiple paths to handle both development (src/) and production (dist/) scenarios
    // All paths now point to root-level .env file
    // In Docker: /usr/src/app/.env (mounted from project root)
    // In local dev: .env (project root) or ../.env (from backend/)
    const envPaths = [
      path.join(process.cwd(), '.env'), // From project root (Docker: /usr/src/app/.env)
      path.join(process.cwd(), '../.env'), // From backend/ directory (local dev)
      path.join(__dirname, '../../../../.env'), // From dist/src/infrastructure/config/
      path.join(__dirname, '../../../.env'), // From dist/src/infrastructure/config/ (alternative)
      path.join(__dirname, '../../.env'), // From src/infrastructure/config/
    ];

    const envPath = envPaths.find(p => {
      const exists = fs.existsSync(p);
      if (exists) {
        this.logger.log(`Loading environment from: ${p}`);
      }
      return exists;
    });

    if (envPath) {
      const result = dotenvConfig({ path: envPath });
      if (result.error) {
        this.logger.warn(`Failed to load .env file: ${result.error.message}`);
      } else {
        this.logger.log(`✅ Loaded environment from .env file: ${envPath}`);
      }
    } else {
      // No .env file found - this is expected in platforms like Coolify, Kubernetes, etc.
      // where environment variables are passed directly to containers
      this.logger.log(
        'ℹ️  No .env file found. Using environment variables from container (e.g., Coolify, Kubernetes, or docker-compose env vars).'
      );
    }

    // Load database configuration
    this.db.host = process.env.DB_HOST || 'localhost';
    this.db.port = +(process.env.DB_PORT || 5432);
    this.db.name = process.env.DB_NAME || 'vendure';
    this.db.username = process.env.DB_USERNAME || 'vendure';
    this.db.password = process.env.DB_PASSWORD || 'vendure';
    this.db.schema = process.env.DB_SCHEMA || 'public';

    // Load audit database configuration
    this.auditDb.host = process.env.AUDIT_DB_HOST || 'timescaledb_audit';
    this.auditDb.port = +(process.env.AUDIT_DB_PORT || 5432);
    this.auditDb.name = process.env.AUDIT_DB_NAME || 'audit_logs';
    this.auditDb.username = process.env.AUDIT_DB_USERNAME || 'audit_user';
    this.auditDb.password = process.env.AUDIT_DB_PASSWORD || 'audit_password';

    // Load application configuration
    this.app.nodeEnv = process.env.NODE_ENV || 'development';
    this.app.port = +(process.env.PORT || 3000);
    this.app.corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:4200';
    this.app.cookieSecret = process.env.COOKIE_SECRET || 'cookie-secret-change-in-production';
    this.app.cookieSecure = process.env.COOKIE_SECURE === 'true';
    this.app.frontendUrl = process.env.FRONTEND_URL || '';
    this.app.assetUrlPrefix = process.env.ASSET_URL_PREFIX || '';

    // Load Email configuration
    this.email.transport = process.env.MAIL_TRANSPORT || 'file';
    this.email.smtpHost = process.env.SMTP_HOST || '';
    this.email.smtpPort = +(process.env.SMTP_PORT || 587);
    this.email.smtpUser = process.env.SMTP_USER || '';
    this.email.smtpPass = process.env.SMTP_PASS || '';

    // Load Redis configuration
    this.redis.host = process.env.REDIS_HOST || 'localhost';
    this.redis.port = +(process.env.REDIS_PORT || 6379);
    this.redis.password = process.env.REDIS_PASSWORD || '';

    // Load SMS configuration
    this.sms.provider = process.env.SMS_PROVIDER || 'textsms';
    this.sms.africastalkingApiKey = process.env.AFRICASTALKING_API_KEY || '';
    this.sms.africastalkingUsername = process.env.AFRICASTALKING_USERNAME || '';
    this.sms.africastalkingSenderId = process.env.AFRICASTALKING_SENDER_ID || '';
    this.sms.africastalkingEnvironment = process.env.AFRICASTALKING_ENVIRONMENT || 'production';
    this.sms.africastalkingApiUrl = process.env.AFRICASTALKING_API_URL || '';
    this.sms.textsmsApiKey = process.env.TEXTSMS_API_KEY || '';
    this.sms.textsmsPartnerId = process.env.TEXTSMS_PARTNER_ID || '';
    this.sms.textsmsShortcode = process.env.TEXTSMS_SHORTCODE || '';

    // Load ML/Webhook configuration
    this.ml.webhookSecret = process.env.ML_WEBHOOK_SECRET || '';
    this.ml.serviceToken = process.env.ML_SERVICE_TOKEN || '';
    // Use Docker service names for internal networking (can be overridden via env vars if needed)
    this.ml.trainerUrl = process.env.ML_TRAINER_URL || 'http://ml-trainer:3005';
    this.ml.backendInternalUrl = process.env.BACKEND_INTERNAL_URL || 'http://backend:3000';
    this.ml.trainingIntervalMinutes = +(process.env.ML_TRAINING_INTERVAL_MINUTES || 60);
    this.ml.trainingCooldownHours = +(process.env.ML_TRAINING_COOLDOWN_HOURS || 4);

    // Load Push notification configuration
    this.push.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    this.push.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
    this.push.vapidSubject = process.env.VAPID_SUBJECT || '';

    // Load Paystack configuration
    this.paystack.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    this.paystack.publicKey = process.env.PAYSTACK_PUBLIC_KEY || '';
    this.paystack.systemEmail =
      process.env.PAYSTACK_SYSTEM_EMAIL || `payments@${BRAND_CONFIG.emailDomain}`;

    // Load OTP configuration
    this.otp.redisHost = process.env.OTP_REDIS_HOST || process.env.REDIS_HOST || 'localhost';
    this.otp.redisPort = +(process.env.OTP_REDIS_PORT || process.env.REDIS_PORT || 6379);
    this.otp.redisPassword = process.env.OTP_REDIS_PASSWORD || process.env.REDIS_PASSWORD || '';

    // Load Superadmin configuration
    this.superadmin.username = process.env.SUPERADMIN_USERNAME || '';
    this.superadmin.password = process.env.SUPERADMIN_PASSWORD || '';

    // Load SigNoz/Observability configuration
    this.observability.enabled = process.env.SIGNOZ_ENABLED === 'true';
    this.observability.serviceName =
      process.env.SIGNOZ_SERVICE_NAME || `${BRAND_CONFIG.servicePrefix}-backend`;
    this.observability.serviceVersion = process.env.SIGNOZ_SERVICE_VERSION || '2.0.0';

    // OTLP endpoint configuration
    const signozHost = process.env.SIGNOZ_HOST || 'signoz';
    const signozGrpcPort = process.env.SIGNOZ_OTLP_GRPC_PORT || '4317';
    const signozHttpPort = process.env.SIGNOZ_OTLP_HTTP_PORT || '4318';

    this.observability.otlpGrpcEndpoint =
      process.env.SIGNOZ_OTLP_GRPC_ENDPOINT || `http://${signozHost}:${signozGrpcPort}`;
    this.observability.otlpHttpEndpoint =
      process.env.SIGNOZ_OTLP_HTTP_ENDPOINT || `http://${signozHost}:${signozHttpPort}`;

    // Legacy endpoint support (for backward compatibility)
    this.observability.endpoint =
      process.env.SIGNOZ_ENDPOINT || this.observability.otlpGrpcEndpoint;

    // Load Admin Notification configuration
    this.adminNotifications.email = process.env.ADMIN_NOTIFICATION_EMAIL || '';
    this.adminNotifications.phone = process.env.ADMIN_NOTIFICATION_PHONE || '';
    this.adminNotifications.channels = process.env.ADMIN_NOTIFICATION_CHANNELS || 'email';

    this.validate();
  }

  /**
   * Check if the application is running in development mode
   * Returns true for 'development' or 'dev' environments
   */
  isDevelopment(): boolean {
    const nodeEnv = this.app.nodeEnv?.toLowerCase() || '';
    return nodeEnv === 'development' || nodeEnv === 'dev' || !nodeEnv;
  }

  /**
   * Check if the application is running in production mode
   */
  isProduction(): boolean {
    return this.app.nodeEnv?.toLowerCase() === 'production';
  }

  /**
   * Validate that required environment variables are set
   */
  validate(): void {
    const required: string[] = [];

    if (!this.db.host) required.push('DB_HOST');
    if (!this.db.name) required.push('DB_NAME');
    if (!this.db.username) required.push('DB_USERNAME');
    if (!this.db.password) required.push('DB_PASSWORD');

    if (!this.superadmin.username) required.push('SUPERADMIN_USERNAME');
    if (!this.superadmin.password) required.push('SUPERADMIN_PASSWORD');

    if (required.length > 0) {
      throw new Error(`Missing required environment variables: ${required.join(', ')}`);
    }
  }
}

/**
 * Global environment configuration instance
 * This is initialized early and available throughout the application lifecycle
 */
export const env = EnvironmentConfig.getInstance();
