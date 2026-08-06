import http from 'http';
import fs from 'fs';
import path from 'path';
const readline = require('readline');

// Queries
const REQUEST_OTP_QUERY = `
  mutation RequestEmailOTP($email: String!, $registrationData: RegistrationInput!) {
    requestEmailRegistrationOTP(email: $email, registrationData: $registrationData) {
      success
      message
      sessionId
    }
  }
`;

const VERIFY_OTP_QUERY = `
  mutation VerifyEmailOTP($email: String!, $otp: String!, $sessionId: String!) {
    verifyEmailRegistrationOTP(email: $email, otp: $otp, sessionId: $sessionId) {
      success
      message
      userId
    }
  }
`;

// Helper Functions
function graphqlRequest(query: string, variables?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      query,
      variables,
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/shop-api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.errors) {
            reject(parsed.errors);
          } else {
            resolve(parsed.data);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', e => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

// Main Verification Flow
async function verifyDualChannelOTP() {
  console.log('\n--- Verifying Dual Channel OTP E2E Flow ---');

  const timestamp = Date.now();

  const phoneNumber = '07' + timestamp.toString().slice(-8); // Random phone number
  const email = `test-${timestamp}@dukarun.com`;

  console.log(`\nGenerating test user:`);
  console.log(`Phone: ${phoneNumber}`);
  console.log(`Email: ${email}`);

  // Step 1: Register User
  console.log(`\n[Step 1] Requesting Registration OTP...`);
  const regVariables = {
    email: email,
    registrationData: {
      companyName: 'Test Company ' + timestamp,
      currency: 'KES',
      adminFirstName: 'Test',
      adminLastName: 'User',
      adminPhoneNumber: phoneNumber,
      adminEmail: email,
      storeName: 'Test Store',
      storeAddress: 'Test Address',
    },
  };

  try {
    const regResult = await graphqlRequest(REQUEST_OTP_QUERY, regVariables);
    console.log('Request Registration OTP Result:', JSON.stringify(regResult, null, 2));

    if (!regResult?.requestEmailRegistrationOTP?.success) {
      console.error('❌ Failed to request registration OTP');
      process.exit(1);
    }

    const sessionId = regResult.requestEmailRegistrationOTP.sessionId;
    console.log('✅ Registration OTP requested successfully');
    console.log(`Session ID: ${sessionId}`);

    // Step 2: Verify Registration OTP
    console.log(`\n[Step 2] Verify Registration OTP`);
    console.log('👉 Please check your backend logs or email output directory for the OTP code.');
    // In automated CI/CD we would verify logs, but here we ask user
    // To make it easier for static analysis check, we'll suggest looking at logs

    const otp = await askQuestion(
      'Enter the OTP code received (or press Enter if you cannot check logs, script will fail verify but continue): '
    );

    if (!otp.trim()) {
      console.log('⚠️ Skipping verification step as no OTP provided.');
    } else {
      const verifyVariables = {
        email: email,
        otp: otp.trim(),
        sessionId: sessionId,
      };

      try {
        const verifyResult = await graphqlRequest(VERIFY_OTP_QUERY, verifyVariables);
        console.log('Verify Registration OTP Result:', JSON.stringify(verifyResult, null, 2));

        if (verifyResult?.verifyEmailRegistrationOTP?.success) {
          console.log('✅ User registered successfully!');
        } else {
          console.error('❌ Failed to verify registration OTP');
          // We continue to Step 3 only if verify succeeded... actually if verify failed user isn't created.
          // But the user might exist in partial state? No.
          // If verify failed, we can't really test login.
          console.log('⚠️ Cannot proceed to Login test without successful registration.');
          return;
        }
      } catch (e: any) {
        console.error('❌ Verification Error:', e.message);
        return;
      }
    }

    // Step 3: Login OTP Flow (Dual Channel Test)
    // Only verify login if registration succeeded (or if we assume it did for testing purposes, but logic dictates user must exist)
    if (otp.trim()) {
      console.log(`\n[Step 3] Testing Login OTP (Dual Channel)...`);
      console.log(`Requesting Login OTP for ${phoneNumber}...`);

      const loginQuery = `
          mutation RequestLoginOTP {
            requestLoginOTP(phoneNumber: "${phoneNumber}") {
              success
              message
            }
          }
        `;

      const loginResult = await graphqlRequest(loginQuery);
      console.log('Request Login OTP Result:', JSON.stringify(loginResult, null, 2));

      if (loginResult?.requestLoginOTP?.success) {
        console.log('✅ Login OTP requested successfully');
        console.log('🎉 SUCCESS! Login OTP request worked for the newly registered user.');
        console.log('👉 Check server logs/email folder. You should see BOTH:');
        console.log('   1. An SMS attempt log');
        console.log('   2. An Email sent with the OTP');
      } else {
        console.log(
          '❌ Failed to request Login OTP:',
          loginResult.errors?.[0]?.message || 'Unknown error'
        );
      }
    }
  } catch (error: any) {
    console.error('❌ Error in verification flow:', error.message || error);
  } finally {
    rl.close();
  }
}

// Execution
if (require.main === module) {
  verifyDualChannelOTP().catch(console.error);
}
