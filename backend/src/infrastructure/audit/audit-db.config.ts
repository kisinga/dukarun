import path from 'path';
import { DataSourceOptions } from 'typeorm';
import { env } from '../config/environment.config';

/**
 * Separate database connection configuration for audit logs (TimescaleDB)
 *
 * This provides clear separation of concerns - audit logs are stored
 * in a dedicated time-series database optimized for audit trail queries.
 *
 * Uses centralized environment configuration instead of direct process.env access.
 */
export const auditDbConfig: DataSourceOptions = {
  type: 'postgres',
  host: env.auditDb.host,
  port: env.auditDb.port,
  username: env.auditDb.username,
  password: env.auditDb.password,
  database: env.auditDb.name,
  schema: 'public',
  synchronize: false, // Never use synchronize in production
  logging: false,
  entities: [
    path.join(__dirname, 'audit-log.entity.{ts,js}'),
    path.join(__dirname, 'admin-login-attempt.entity.{ts,js}'),
  ],
  migrations: [path.join(__dirname, '../migrations/audit-*.{ts,js}')],
  // Connection pool settings for better reliability
  extra: {
    max: 10, // Maximum number of connections in the pool
    min: 2, // Minimum number of connections in the pool
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 10000, // Wait 10 seconds before timing out when connecting
  },
};
