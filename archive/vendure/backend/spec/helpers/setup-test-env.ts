import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

process.env.SUPERADMIN_USERNAME = 'test-superadmin';
process.env.SUPERADMIN_PASSWORD = 'test-superadmin-password';
