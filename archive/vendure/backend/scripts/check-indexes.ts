#!/usr/bin/env ts-node
import { DataSource } from 'typeorm';
import { EnvironmentConfig } from '../src/infrastructure/config/environment.config';

// Load environment configuration (single source of truth)
const env = EnvironmentConfig.getInstance();

const ds = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.name,
  schema: env.db.schema,
});

async function checkIndexes() {
  await ds.initialize();
  const indexes = await ds.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'ledger_journal_line' 
      AND indexname LIKE 'IDX_journal_line_meta%'
    ORDER BY indexname;
  `);
  console.log('GIN Indexes:', JSON.stringify(indexes, null, 2));

  const migrations = await ds.query(`
    SELECT name, timestamp FROM migrations 
    WHERE name LIKE '%1766000%' 
    ORDER BY timestamp DESC;
  `);
  console.log('\nRecent migrations:', JSON.stringify(migrations, null, 2));

  await ds.destroy();
}

checkIndexes().catch(console.error);
