import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';

/**
 * Environment Configuration Service
 *
 * Centralized service for loading and accessing environment variables.
 * Similar pattern to the Vendure backend environment config.
 */
export class EnvironmentConfig {
  private static instance: EnvironmentConfig | null = null;
  private initialized = false;

  // Application configuration
  readonly app = {
    nodeEnv: 'development',
    ML_PORT: 3005,
  };

  // ML Service configuration
  readonly ml = {
    serviceToken: '',
  };

  /**
   * Get singleton instance
   */
  static getInstance(): EnvironmentConfig {
    if (!EnvironmentConfig.instance) {
      EnvironmentConfig.instance = new EnvironmentConfig();
      EnvironmentConfig.instance.loadEnvironment();
    }
    return EnvironmentConfig.instance;
  }

  /**
   * Load environment variables from .env file
   */
  private loadEnvironment(): void {
    if (this.initialized) {
      return;
    }

    // Try multiple paths to handle both development and production scenarios
    // Similar to backend: when running `npm run dev` from ml-trainer/, process.cwd() is ml-trainer/
    // So we check ../.env (project root) first, then ml-trainer/.env
    // In Docker: process.cwd() is /app, so .env would be checked first
    const envPaths = [
      path.join(process.cwd(), '../.env'), // From ml-trainer/ directory -> project root (local dev: npm run dev)
      path.join(process.cwd(), '.env'), // From project root (Docker: /app/.env) or ml-trainer/.env
      path.join(__dirname, '../../../../.env'), // From dist/src/config/ -> project root
      path.join(__dirname, '../../../.env'), // From dist/src/config/ (alternative)
      path.join(__dirname, '../../.env'), // From src/config/
    ];

    const envPath = envPaths.find(p => {
      const exists = fs.existsSync(p);
      if (exists) {
        console.log(`Loading environment from: ${p}`);
      }
      return exists;
    });

    if (envPath) {
      const result = dotenvConfig({ path: envPath });
      if (result.error) {
        console.warn(`Failed to load .env file: ${result.error.message}`);
      } else {
        console.log(`✅ Loaded environment from .env file: ${envPath}`);
      }
    } else {
      // No .env file found - use environment variables from container
      console.log(
        'ℹ️  No .env file found. Using environment variables from container (e.g., docker-compose env vars).'
      );
    }

    // Load application configuration
    this.app.nodeEnv = process.env.NODE_ENV || 'development';
    this.app.ML_PORT = +(process.env.ML_PORT || 3005);

    // Load ML service configuration
    this.ml.serviceToken = process.env.ML_SERVICE_TOKEN || '';

    this.initialized = true;
    this.validate();
  }

  /**
   * Check if the application is running in development mode
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

    if (!this.ml.serviceToken) {
      required.push('ML_SERVICE_TOKEN');
    }

    if (required.length > 0) {
      console.warn(`⚠️  Missing recommended environment variables: ${required.join(', ')}`);
      console.warn('   Service will still run but may have limited functionality.');
    }
  }
}

/**
 * Global environment configuration instance
 */
export const env = EnvironmentConfig.getInstance();
