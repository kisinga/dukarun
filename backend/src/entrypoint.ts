#!/usr/bin/env ts-node

/**
 * Dukarun Entrypoint Logic
 *
 * This module contains the core initialization logic used by both
 * the Docker entrypoint and the test suite to ensure identical behavior.
 *
 * Detects database state, runs migrations, and starts the application.
 * Superadmin is created automatically by Vendure during bootstrap.
 */

import { execSync, spawn } from 'child_process';
// Initialize environment configuration early (before database detection)
import { BRAND_CONFIG } from './constants/brand.constants';
import './infrastructure/config/environment.config';
import { env } from './infrastructure/config/environment.config';
import { config } from './vendure-config';
import { initializeVendureBootstrap } from './utils/bootstrap-init';
import { isDatabaseEmpty, waitForDatabase } from './utils/database-detection';

export interface EntrypointOptions {
  testMode?: boolean;
  skipServerStart?: boolean;
}

export class DukarunEntrypoint {
  private options: EntrypointOptions;

  constructor(options: EntrypointOptions = {}) {
    this.options = {
      testMode: false,
      skipServerStart: false,
      ...options,
    };
  }

  /**
   * Detect database state
   * Checks if database is empty (no tables exist yet)
   */
  async detectDatabaseState(): Promise<void> {
    console.log('🔍 Checking database state...');

    try {
      // Wait for database to be available (with retries)
      const dbAvailable = await waitForDatabase(30, 1000);
      if (!dbAvailable) {
        throw new Error('Database is not available after maximum retries');
      }

      // Check if database is empty
      const isEmpty = await isDatabaseEmpty();

      if (isEmpty) {
        console.log(
          '📦 Database is empty - superadmin will be created automatically during bootstrap'
        );
        // Superadmin is created automatically by Vendure during bootstrap
        // via AdministratorService.ensureSuperAdminExists() which uses config.authOptions.superadminCredentials
      } else {
        console.log('✅ Database already contains data');
      }
    } catch (error) {
      // If we can't check the database state, log and continue
      // This allows the system to start even if detection fails
      // (migrations will handle any missing schema)
      console.warn(
        '⚠️  Could not determine database state:',
        error instanceof Error ? error.message : String(error)
      );
      console.warn('⚠️  Continuing with migrations...');
    }
  }

  /**
   * Run migrations (adds custom fields)
   * Uses Vendure's runMigrations which only runs pending migrations
   */
  async runMigrations(): Promise<void> {
    console.log('🔧 Running migrations...');

    try {
      execSync('npm run migration:run', {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      console.log('✅ Migrations complete');
    } catch (error) {
      console.error('❌ Migrations failed!');
      throw error;
    }
  }

  /**
   * Start the application
   * Starts server and worker processes directly
   */
  async startApplication(): Promise<void> {
    if (this.options.skipServerStart) {
      console.log('🚫 Server start skipped (test mode)');
      return;
    }

    console.log('🚀 Starting Vendure server and worker...');

    // Start both processes directly
    const serverProcess = spawn('node', ['./dist/src/index.js'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    const workerProcess = spawn('node', ['./dist/src/index-worker.js'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    // Handle process errors
    serverProcess.on('error', error => {
      console.error('❌ Server process error:', error);
    });

    workerProcess.on('error', error => {
      console.error('❌ Worker process error:', error);
    });

    // Forward signals to child processes
    const shutdown = (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down...`);
      serverProcess.kill(signal as NodeJS.Signals);
      workerProcess.kill(signal as NodeJS.Signals);
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Wait for both processes (they should run indefinitely)
    // If one exits, we log it but keep the container running until both exit
    return new Promise<void>((resolve, reject) => {
      let serverExited = false;
      let workerExited = false;
      let serverExitCode: number | null = null;
      let workerExitCode: number | null = null;

      const checkBothExited = () => {
        if (serverExited && workerExited) {
          // Both processes exited
          if (
            (serverExitCode !== null && serverExitCode !== 0) ||
            (workerExitCode !== null && workerExitCode !== 0)
          ) {
            reject(
              new Error(`Processes exited - Server: ${serverExitCode}, Worker: ${workerExitCode}`)
            );
          } else {
            // Both exited with 0 or signal (graceful shutdown)
            resolve();
          }
        }
      };

      serverProcess.on('exit', (code, signal) => {
        serverExited = true;
        serverExitCode = code;
        if (signal) {
          console.log(`Server was killed with signal ${signal}`);
        } else if (code !== null && code !== 0) {
          console.error(`❌ Server exited with code ${code}`);
        }
        checkBothExited();
      });

      workerProcess.on('exit', (code, signal) => {
        workerExited = true;
        workerExitCode = code;
        if (signal) {
          console.log(`Worker was killed with signal ${signal}`);
        } else if (code !== null && code !== 0) {
          console.error(`❌ Worker exited with code ${code}`);
        }
        checkBothExited();
      });
    });
  }

  /**
   * Main entrypoint logic
   *
   * Flow:
   * 1. Detect database state
   * 2. Start the application (which handles core table creation and migrations)
   *
   * Note: Migrations are now handled in index.ts to ensure Vendure core tables
   * are created BEFORE custom migrations run (for FK constraints).
   */
  async run(): Promise<void> {
    console.log(`🚀 ${BRAND_CONFIG.displayName} Entrypoint starting...`);

    try {
      // Step 1: Detect database state
      await this.detectDatabaseState();

      // Step 2: Initialize Vendure core tables and run migrations once before
      // starting the server/worker processes. Child processes will skip this step
      // via SKIP_BOOTSTRAP_INIT.
      console.log('🧱 Running centralized bootstrap initialization...');
      await initializeVendureBootstrap(config);
      console.log('✅ Bootstrap initialization complete');
      process.env.SKIP_BOOTSTRAP_INIT = '1';

      // Step 3: Start the application
      // Child processes only bootstrap runtime; initialization already done.
      await this.startApplication();
    } catch (error) {
      console.error('❌ Entrypoint failed:', error);
      throw error;
    }
  }
}

/**
 * CLI entrypoint for Docker
 */
if (require.main === module) {
  const testMode = env.app.nodeEnv === 'test';

  const entrypoint = new DukarunEntrypoint({
    testMode,
    skipServerStart: testMode,
  });

  entrypoint.run().catch(error => {
    console.error('❌ Entrypoint failed:', error);
    process.exit(1);
  });
}
