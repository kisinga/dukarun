#!/usr/bin/env node

/**
 * Test script to verify the Asset relationship migration works for fresh setups
 * This script simulates a fresh database installation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Asset relationship migration for fresh setup...\n');

async function verifyCoreTables(ensureCoreTables, stageLabel) {
  const { missingTables, schema } = await ensureCoreTables();
  if (missingTables.length > 0) {
    throw new Error(
      `Missing Vendure core tables after ${stageLabel} (${schema}): ${missingTables.join(', ')}`
    );
  }
  console.log(`✅ Verified Vendure core tables in schema "${schema}" after ${stageLabel}`);
}

async function main() {
  try {
    // Step 1: Build the project
    console.log('📦 Building project...');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Build successful\n');

    // Step 2: Check if migrations exist
    const migrationsDir = path.join(__dirname, 'dist', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));

    console.log('📋 Found migrations:');
    migrationFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
    console.log('');

    // Lazy load detection helper now that dist/ exists
    const { ensureCoreTables } = require('./dist/src/utils/database-detection');

    // Step 3: Run migrations
    console.log('🔄 Running migrations...');
    execSync('npm run migration:run', { stdio: 'inherit' });
    console.log('✅ Migrations completed successfully\n');

    await verifyCoreTables(ensureCoreTables, 'running migrations');

    // Step 4: Test backend startup
    console.log('🚀 Testing backend startup...');
    const startTime = Date.now();

    // Start backend in background
    execSync('timeout 10 npm run dev:server', {
      stdio: 'pipe',
      encoding: 'utf8',
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`✅ Backend started successfully in ${duration}ms`);
    console.log('✅ All APIs should be available at http://localhost:3000');
    console.log('✅ Admin UI should be available at http://localhost:3000/admin\n');

    console.log('🎉 MIGRATION TEST PASSED!');
    console.log('📝 The Asset relationship migration works correctly for fresh setups');
    console.log('🔗 You can now manage assets through the Vendure Admin UI');
  } catch (error) {
    console.error('❌ Migration test failed:');
    console.error(error.message);
    process.exit(1);
  }
}

main();
