// Debug script to check Google OAuth configuration
import dotenv from 'dotenv';
dotenv.config();

console.log('=== Google OAuth Configuration Debug ===');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'NOT SET');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'NOT SET');
console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL);
console.log('');

console.log('=== Expected URLs ===');
console.log('Auth URL: http://localhost:3000/auth/google');
console.log('Callback URL: http://localhost:3000/auth/google/callback');
console.log('');

console.log('=== Instructions ===');
console.log('1. Go to Google Cloud Console: https://console.cloud.google.com/');
console.log('2. Navigate to APIs & Services > Credentials');
console.log('3. Find your OAuth 2.0 Client ID');
console.log('4. Click Edit');
console.log('5. In Authorized redirect URIs, make sure you have:');
console.log('   http://localhost:3000/auth/google/callback');
console.log('6. Save changes and try again');
