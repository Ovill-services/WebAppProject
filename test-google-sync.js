const { Pool } = require('pg');
const googleCalendarService = require('./private-zone-app/services/googleCalendarService');

// Database connection
const db = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Ovill',
    password: 'mysecretpassword',
    port: 5434,
});

// Copy the syncGoogleCalendarEvents function
async function syncGoogleCalendarEvents(userEmail, events) {
    console.log(`Starting sync for ${userEmail} with ${events.length} events`);
    
    for (const event of events) {
        try {
            // Transform Google Calendar event to our format
            const eventData = {
                user_email: userEmail,
                google_event_id: event.id,
                title: event.summary || 'Untitled Event',
                description: event.description || null,
                start_time: event.start?.dateTime || event.start?.date,
                end_time: event.end?.dateTime || event.end?.date,
                location: event.location || null,
                is_all_day: !event.start?.dateTime, // If no dateTime, it's an all-day event
                event_type: 'google_calendar'
            };
            
            // Handle all-day events (convert date to timestamp)
            if (eventData.is_all_day) {
                eventData.start_time = eventData.start_time + ' 00:00:00';
                eventData.end_time = eventData.end_time + ' 23:59:59';
            }
            
            console.log(`Processing event: ${eventData.title}`);
            
            // Upsert the event (insert or update if exists)
            await db.query(`
                INSERT INTO calendar_events (
                    user_email, google_event_id, title, description, 
                    start_time, end_time, location, is_all_day, event_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (user_email, google_event_id) 
                DO UPDATE SET 
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    start_time = EXCLUDED.start_time,
                    end_time = EXCLUDED.end_time,
                    location = EXCLUDED.location,
                    is_all_day = EXCLUDED.is_all_day,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                eventData.user_email,
                eventData.google_event_id,
                eventData.title,
                eventData.description,
                eventData.start_time,
                eventData.end_time,
                eventData.location,
                eventData.is_all_day,
                eventData.event_type
            ]);
            
            console.log(`✓ Synced event: ${eventData.title}`);
            
        } catch (error) {
            console.error(`Error syncing event ${event.summary}:`, error);
        }
    }
    
    console.log(`Completed sync for ${userEmail}`);
}

async function testGoogleCalendarSync() {
    try {
        console.log('Testing Google Calendar Sync...');
        
        // Get user's Google Calendar tokens
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token, expires_at FROM google_calendar_integration WHERE user_email = $1 AND is_active = true',
            ['testoren25@gmail.com']
        );
        
        if (tokenResult.rows.length === 0) {
            console.log('No Google Calendar integration found for testoren25@gmail.com');
            return;
        }
        
        let { access_token, refresh_token, expires_at } = tokenResult.rows[0];
        console.log('Found Google Calendar integration');
        console.log('Token expires at:', expires_at);
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            console.log('Token expired, attempting to refresh...');
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                console.log('Token refreshed successfully');
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : new Date(Date.now() + 3600000);
                await db.query(
                    'UPDATE google_calendar_integration SET access_token = $1, expires_at = $2 WHERE user_email = $3',
                    [refreshedTokens.access_token, newExpiresAt, 'testoren25@gmail.com']
                );
                console.log('Updated tokens in database');
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                return;
            }
        }
        
        // Set credentials and get events
        googleCalendarService.setCredentials({ access_token, refresh_token });
        const startDate = new Date().toISOString();
        const endDate = new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
        
        console.log('Fetching events from Google Calendar...');
        const events = await googleCalendarService.getEvents(startDate, endDate);
        console.log(`Found ${events.length} events`);
        
        if (events.length > 0) {
            // Sync events to local database
            await syncGoogleCalendarEvents('testoren25@gmail.com', events);
            console.log('Sync completed successfully!');
        } else {
            console.log('No events found in Google Calendar');
        }
        
    } catch (error) {
        console.error('Error testing Google Calendar sync:', error);
    } finally {
        await db.end();
    }
}

testGoogleCalendarSync();
