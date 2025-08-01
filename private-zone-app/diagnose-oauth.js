import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Diagnosing OAuth Issue...\n');

// Check environment variables
console.log('📋 Current Configuration:');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 
    `${process.env.GOOGLE_CLIENT_ID.substring(0, 20)}...` : '❌ NOT SET');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 
    `${process.env.GOOGLE_CLIENT_SECRET.substring(0, 10)}...` : '❌ NOT SET');
console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI || '❌ NOT SET');

console.log('\n🧪 Testing Manual OAuth URL:');
const clientId = process.env.GOOGLE_CLIENT_ID;
const redirectUri = encodeURIComponent('http://localhost:3001/auth/google/callback');
const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.readonly');

if (clientId) {
    const manualUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&access_type=offline&prompt=consent`;
    
    console.log('✅ Manual OAuth URL generated:');
    console.log(manualUrl);
    console.log('\n📝 Instructions:');
    console.log('1. Copy the URL above');
    console.log('2. Paste it in your browser');
    console.log('3. If you get "Access blocked", follow the setup guide');
    console.log('4. If you reach Google sign-in, the basic setup is working');
} else {
    console.log('❌ Cannot generate test URL - Client ID missing');
    console.log('📋 Please follow the setup guide to get new credentials');
}

console.log('\n🔧 Common Issues:');
console.log('• "Access blocked" = OAuth consent screen not configured or API not enabled');
console.log('• "Invalid client" = Wrong client ID or redirect URI mismatch');
console.log('• "unauthorized_client" = Client not properly configured');

console.log('\n📞 Next Steps:');
console.log('1. Follow the setup guide: ./fix-oauth-setup.sh');
console.log('2. Enable Google Calendar API in Google Cloud Console');
console.log('3. Add yourself as a test user in OAuth consent screen');
console.log('4. Update .env with new credentials');
console.log('5. Test again with: node diagnose-oauth.js');
