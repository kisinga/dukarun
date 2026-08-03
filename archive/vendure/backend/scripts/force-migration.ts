#!/usr/bin/env ts-node
/**
 * Force Migration to Run Again
 *
 * Removes migration records from the database so they can be re-run.
 * Usage: ts-node scripts/force-migration.ts <migration-name>
 */

import { DataSource } from 'typeorm';
import { EnvironmentConfig } from '../src/infrastructure/config/environment.config';

// Load environment configuration (single source of truth)
const env = EnvironmentConfig.getInstance();

const migrationName = process.argv[2];

if (!migrationName) {
  console.error('Usage: ts-node scripts/force-migration.ts <migration-name>');
  console.error('Example: ts-node scripts/force-migration.ts EnsureGinIndexes1766000500000');
  process.exit(1);
}

const dataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.name,
  schema: env.db.schema,
});

async function forceMigration() {
  try {
    await dataSource.initialize();
    console.log('Connected to database');

    // Check if migration exists
    const result = await dataSource.query(`SELECT * FROM migrations WHERE name = $1`, [
      migrationName,
    ]);

    if (result.length === 0) {
      console.log(`Migration "${migrationName}" not found in migrations table.`);
      console.log('It will run on next application startup.');
      return;
    }

    console.log(`Found migration: ${migrationName}`);
    console.log(`Timestamp: ${result[0].timestamp}`);

    // Remove the migration record
    await dataSource.query(`DELETE FROM migrations WHERE name = $1`, [migrationName]);

    console.log(`✅ Removed migration "${migrationName}" from migrations table.`);
    console.log('It will run again on next application startup.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

forceMigration();
