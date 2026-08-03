const { createConnection } = require('typeorm');
const { config } = require('../dist/vendure-config');

/**
 * Setup Payment Methods Script
 *
 * This script sets up the default payment methods (Cash and M-Pesa) with their icons
 * in the database. It should be run after the migration has been applied.
 */

async function setupPaymentMethods() {
  console.log('🔧 Setting up payment methods...');

  try {
    // Get the database connection from Vendure config
    const connection = await createConnection(config.dbConnectionOptions);

    // Check if payment methods exist
    const existingMethods = await connection.query(`
            SELECT code FROM payment_method WHERE code IN ('marki-cash', 'marki-mpesa')
        `);

    console.log('📋 Existing payment methods:', existingMethods);

    // Update cash payment method (marki-cash)
    const cashExists = existingMethods.some(m => m.code === 'marki-cash');
    if (cashExists) {
      await connection.query(`
                UPDATE payment_method 
                SET "customFieldsIcon" = 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z'
                WHERE code = 'marki-cash'
            `);
      console.log('✅ Updated marki-cash payment method');
    } else {
      console.log('⚠️ marki-cash payment method not found');
    }

    // Update M-Pesa payment method (marki-mpesa)
    const mpesaExists = existingMethods.some(m => m.code === 'marki-mpesa');
    if (mpesaExists) {
      await connection.query(`
                UPDATE payment_method 
                SET "customFieldsIcon" = 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z'
                WHERE code = 'marki-mpesa'
            `);
      console.log('✅ Updated marki-mpesa payment method');
    } else {
      console.log('⚠️ marki-mpesa payment method not found');
    }

    console.log('✅ Payment methods updated with icons');

    // Verify the updates
    const cashMethod = await connection.query(`
            SELECT code, "customFieldsIcon" FROM payment_method WHERE code = 'marki-cash'
        `);

    const mpesaMethod = await connection.query(`
            SELECT code, "customFieldsIcon" FROM payment_method WHERE code = 'marki-mpesa'
        `);

    console.log('📋 Cash payment method:', cashMethod[0]);
    console.log('📋 M-Pesa payment method:', mpesaMethod[0]);

    await connection.close();
    console.log('✅ Setup completed successfully');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run the setup
setupPaymentMethods();
