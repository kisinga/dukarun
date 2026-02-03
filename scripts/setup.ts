#!/usr/bin/env ts-node
/**
 * Dukarun Setup & Healthcheck Script
 *
 * This script serves dual purpose:
 * - First-time setup: Detects missing node_modules and runs npm i
 * - Healthcheck: Can be run anytime to diagnose environment issues
 *
 * Usage:
 *   npm run setup              # Full check
 *   npm run setup -- --quick   # Skip slow checks (DB connection)
 *   npm run setup -- --fix     # Auto-fix issues where possible
 *   npm run setup -- --quick --fix  # Quick check with auto-fix (used by predev)
 */

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`\n${colors.blue}▶${colors.reset} ${msg}`),
};

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  quick: args.includes('--quick'),
  fix: args.includes('--fix'),
  startServices: args.includes('--start-services'),
  help: args.includes('--help') || args.includes('-h'),
};

if (flags.help) {
  console.log(`
Dukarun Setup & Healthcheck Script

Usage: npm run setup [options]

Options:
  --quick          Skip slow checks (DB connection test)
  --fix            Auto-fix issues where possible (create .env, run npm i)
  --start-services Start Docker infrastructure services
  --help, -h       Show this help message

Examples:
  npm run setup              # Full health check
  npm run setup -- --quick   # Quick check only
  npm run setup -- --fix     # Full check with auto-fix
  npm run setup -- --quick --fix  # Quick check with auto-fix (used by predev)
`);
  process.exit(0);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const WORKSPACES = ['backend', 'frontend', 'ml-trainer'];
const NETWORK_NAME = 'dukarun_services_network';

interface CheckResult {
  passed: boolean;
  message: string;
  fixable?: boolean;
}

let hasErrors = false;
let hasWarnings = false;

/**
 * Check if a command exists
 */
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker is running
 */
function checkDocker(): CheckResult {
  log.step('Checking Docker...');

  if (!commandExists('docker')) {
    return { passed: false, message: 'Docker is not installed' };
  }

  try {
    execSync('docker info', { stdio: 'ignore' });
    log.success('Docker is running');
    return { passed: true, message: 'Docker is running' };
  } catch {
    return { passed: false, message: 'Docker is not running. Please start Docker Desktop or the Docker daemon.' };
  }
}

/**
 * Check if Docker network exists
 */
function checkNetwork(): CheckResult {
  log.step('Checking Docker network...');

  try {
    const result = execSync(`docker network ls --filter name=${NETWORK_NAME} --format "{{.Name}}"`, {
      encoding: 'utf-8',
    }).trim();

    if (result === NETWORK_NAME) {
      log.success(`Network '${NETWORK_NAME}' exists`);
      return { passed: true, message: 'Network exists' };
    }

    return { passed: false, message: `Network '${NETWORK_NAME}' does not exist`, fixable: true };
  } catch {
    return { passed: false, message: 'Failed to check Docker network', fixable: true };
  }
}

/**
 * Create Docker network
 */
function createNetwork(): boolean {
  try {
    execSync(`docker network create ${NETWORK_NAME}`, { stdio: 'inherit' });
    log.success(`Created network '${NETWORK_NAME}'`);
    return true;
  } catch {
    log.error(`Failed to create network '${NETWORK_NAME}'`);
    return false;
  }
}

/**
 * Check if .env file exists
 */
function checkEnvFile(): CheckResult {
  log.step('Checking .env file...');

  const envPath = path.join(ROOT_DIR, '.env');
  const envExamplePath = path.join(ROOT_DIR, '.env.example');

  if (fs.existsSync(envPath)) {
    log.success('.env file exists');
    return { passed: true, message: '.env file exists' };
  }

  if (fs.existsSync(envExamplePath)) {
    return { passed: false, message: '.env file not found (will copy from .env.example)', fixable: true };
  }

  return { passed: false, message: '.env file not found and no .env.example available' };
}

/**
 * Copy .env.example to .env
 */
function createEnvFile(): boolean {
  const envPath = path.join(ROOT_DIR, '.env');
  const envExamplePath = path.join(ROOT_DIR, '.env.example');

  try {
    fs.copyFileSync(envExamplePath, envPath);
    log.success('Created .env from .env.example');
    log.warn('Please review .env and update passwords/secrets before production use!');
    return true;
  } catch (err) {
    log.error(`Failed to create .env: ${err}`);
    return false;
  }
}

/**
 * Check for deprecated environment variables
 */
function checkDeprecatedEnvVars(): void {
  log.step('Checking environment variables...');

  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    log.warn('No .env file to check');
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const deprecatedVars = [
    { name: 'DB_USER', replacement: 'DB_USERNAME' },
    { name: 'AUDIT_DB_USER', replacement: 'AUDIT_DB_USERNAME' },
    { name: 'VAPID_SUBJECT', replacement: 'VAPID_EMAIL' },
  ];

  let foundDeprecated = false;
  for (const { name, replacement } of deprecatedVars) {
    // Check if the deprecated var is defined (not just mentioned in comments)
    const regex = new RegExp(`^${name}=`, 'm');
    if (regex.test(envContent)) {
      log.warn(`Deprecated: ${name} - use ${replacement} instead`);
      foundDeprecated = true;
      hasWarnings = true;
    }
  }

  if (!foundDeprecated) {
    log.success('No deprecated environment variables found');
  }
}

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Check required ports
 */
async function checkPorts(): Promise<void> {
  log.step('Checking port availability...');

  const ports = [
    { port: 5432, name: 'PostgreSQL' },
    { port: 5433, name: 'TimescaleDB' },
    { port: 6379, name: 'Redis' },
    { port: 3000, name: 'Backend' },
    { port: 4200, name: 'Frontend' },
    { port: 3005, name: 'ML Trainer' },
  ];

  for (const { port, name } of ports) {
    const available = await isPortAvailable(port);
    if (available) {
      log.success(`Port ${port} (${name}) is available`);
    } else {
      log.warn(`Port ${port} (${name}) is in use - service may already be running`);
      hasWarnings = true;
    }
  }
}

/**
 * Check if node_modules exist in workspaces
 */
function checkNodeModules(): CheckResult {
  log.step('Checking node_modules...');

  const missing: string[] = [];

  // Check root
  if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) {
    missing.push('root');
  }

  // Check workspaces
  for (const workspace of WORKSPACES) {
    const nodeModulesPath = path.join(ROOT_DIR, workspace, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      missing.push(workspace);
    }
  }

  if (missing.length === 0) {
    log.success('All node_modules directories exist');
    return { passed: true, message: 'Dependencies installed' };
  }

  return {
    passed: false,
    message: `Missing node_modules in: ${missing.join(', ')}`,
    fixable: true,
  };
}

/**
 * Install dependencies
 */
function installDependencies(): boolean {
  log.info('Installing dependencies (this may take a while)...');

  try {
    execSync('npm install', { cwd: ROOT_DIR, stdio: 'inherit' });
    log.success('Dependencies installed successfully');
    return true;
  } catch (err) {
    log.error(`Failed to install dependencies: ${err}`);
    return false;
  }
}

/**
 * Test database connection
 */
async function testDatabaseConnection(): Promise<CheckResult> {
  log.step('Testing database connection...');

  // Load environment variables
  const envPath = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = process.env.DB_USERNAME || 'vendure';
  const database = process.env.DB_NAME || 'vendure';

  // Try to connect using pg_isready via docker exec first
  try {
    const result = spawnSync('docker', [
      'compose', '-f', 'docker-compose.services.yml',
      'exec', '-T', 'postgres_db',
      'pg_isready', '-U', user, '-d', database,
    ], {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      timeout: 5000,
    });

    if (result.status === 0) {
      log.success(`Database connection successful (${host}:${port}/${database})`);
      return { passed: true, message: 'Database is reachable' };
    }
  } catch {
    // Fall through to socket check
  }

  // Fallback: check if port is listening
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.on('connect', () => {
      socket.destroy();
      log.success(`Database port ${port} is open (connection details: ${host}:${port}/${database})`);
      resolve({ passed: true, message: 'Database port is reachable' });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        passed: false,
        message: `Cannot connect to database at ${host}:${port}. Is Docker running with services up?`,
      });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({
        passed: false,
        message: `Cannot connect to database at ${host}:${port}. Run 'npm run services:up' first.`,
      });
    });

    socket.connect(port, host);
  });
}

/**
 * Start Docker services
 */
function startServices(): boolean {
  log.step('Starting infrastructure services...');

  try {
    execSync('docker compose -f docker-compose.services.yml up -d', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    log.success('Infrastructure services started');
    return true;
  } catch (err) {
    log.error(`Failed to start services: ${err}`);
    return false;
  }
}

/**
 * Main setup function
 */
async function main(): Promise<void> {
  console.log('\n🔧 Dukarun Setup & Healthcheck\n');

  // Check Docker
  const dockerResult = checkDocker();
  if (!dockerResult.passed) {
    log.error(dockerResult.message);
    hasErrors = true;
    process.exit(1);
  }

  // Check network
  const networkResult = checkNetwork();
  if (!networkResult.passed) {
    if (flags.fix && networkResult.fixable) {
      createNetwork();
    } else {
      log.error(networkResult.message);
      log.info("Run with --fix to create the network, or: docker network create dukarun_services_network");
      hasErrors = true;
    }
  }

  // Check .env file
  const envResult = checkEnvFile();
  if (!envResult.passed) {
    if (flags.fix && envResult.fixable) {
      createEnvFile();
    } else {
      log.error(envResult.message);
      log.info('Run with --fix to create .env from .env.example');
      hasErrors = true;
    }
  }

  // Check for deprecated env vars
  checkDeprecatedEnvVars();

  // Check node_modules
  const nodeModulesResult = checkNodeModules();
  if (!nodeModulesResult.passed) {
    if (flags.fix && nodeModulesResult.fixable) {
      installDependencies();
    } else {
      log.error(nodeModulesResult.message);
      log.info("Run 'npm install' at the project root first");
      hasErrors = true;
    }
  }

  // Check ports (quick check, always run)
  if (!flags.quick) {
    await checkPorts();
  }

  // Start services if requested
  if (flags.startServices) {
    startServices();
  }

  // Test database connection (skip if --quick)
  if (!flags.quick) {
    const dbResult = await testDatabaseConnection();
    if (!dbResult.passed) {
      log.warn(dbResult.message);
      hasWarnings = true;
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  if (hasErrors) {
    log.error('Setup completed with errors. Please fix the issues above.');
    process.exit(1);
  } else if (hasWarnings) {
    log.warn('Setup completed with warnings. Review the messages above.');
    process.exit(0);
  } else {
    log.success('All checks passed! Ready to run: npm run dev');
    process.exit(0);
  }
}

main().catch((err) => {
  log.error(`Unexpected error: ${err}`);
  process.exit(1);
});
