import { GoogleCalendarService } from './services/googleCalendarService.js';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "Ovill",
  password: "mysecretpassword",
  port: 5433,
});

async function testCalendarEvents() {
    try {
        await db.connect();
        console.log('🔍 Testing Calendar Events Loading...\n');
        
        // Check if we have any calendar integrations
        const integrationQuery = 'SELECT user_email, is_active, created_at FROM google_calendar_integration WHERE is_active = true';
        const integrations = await db.query(integrationQuery);
        
        console.log(`📊 Found ${integrations.rows.length} active calendar integration(s):`);
        integrations.rows.forEach(row => {
            console.log(`  • ${row.user_email} (connected: ${row.created_at})`);
        });
        
        if (integrations.rows.length === 0) {
            console.log('❌ No active calendar integrations found');
            console.log('💡 Make sure to log in with Google to create integration');
            return;
        }
        
        // Test API endpoint simulation
        const testUser = integrations.rows[0];
        console.log(`\n🧪 Testing calendar events for: ${testUser.user_email}`);
        
        // Get tokens
        const tokenQuery = 'SELECT access_token, refresh_token, expires_at FROM google_calendar_integration WHERE user_email = $1 AND is_active = true';
        const tokenResult = await db.query(tokenQuery, [testUser.user_email]);
        
        if (tokenResult.rows.length === 0) {
            console.log('❌ No tokens found for user');
            return;
        }
        
        const { access_token, refresh_token, expires_at } = tokenResult.rows[0];
        console.log('✅ Tokens found');
        console.log('📅 Token expires at:', expires_at);
        
        // Test Google Calendar service
        const googleCalendarService = new GoogleCalendarService();
        googleCalendarService.setCredentials({ 
            access_token, 
            refresh_token 
        });
        
        const startDate = new Date().toISOString();
        const endDate = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        
        console.log('\n📅 Fetching events from Google Calendar...');
        const events = await googleCalendarService.getEvents(startDate, endDate);
        
        console.log(`🎉 Found ${events.length} events:`);
        events.forEach((event, index) => {
            console.log(`  ${index + 1}. ${event.title}`);
            console.log(`     📅 ${new Date(event.start).toLocaleDateString()}`);
            console.log(`     🕐 ${event.allDay ? 'All day' : new Date(event.start).toLocaleTimeString()}`);
            if (event.location) console.log(`     📍 ${event.location}`);
            console.log('');
        });
        
        if (events.length === 0) {
            console.log('📝 No events found in the next 30 days');
            console.log('💡 Try adding some events to your Google Calendar for testing');
        }
        
    } catch (error) {
        console.error('❌ Error testing calendar events:', error);
        if (error.message.includes('Invalid Credentials')) {
            console.log('🔑 Token might be expired or invalid');
            console.log('💡 Try logging in with Google again');
        }
    } finally {
        await db.end();
    }
}

testCalendarEvents();
