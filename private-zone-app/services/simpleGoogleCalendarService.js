import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

export class SimpleGoogleCalendarService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        
        this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    }

    // Generate auth URL with minimal scopes
    getAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/calendar.readonly'
        ];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent'
        });
    }

    // Test if Google OAuth credentials work
    async testConnection() {
        try {
            console.log('Testing Google OAuth configuration...');
            const authUrl = this.getAuthUrl();
            console.log('✅ OAuth URL generated successfully');
            console.log('🔗 Test this URL in browser:', authUrl);
            return { success: true, authUrl };
        } catch (error) {
            console.error('❌ OAuth configuration failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Exchange authorization code for tokens
    async getTokenFromCode(code) {
        try {
            const { tokens } = await this.oauth2Client.getAccessToken(code);
            this.oauth2Client.setCredentials(tokens);
            return tokens;
        } catch (error) {
            console.error('Error getting tokens from code:', error);
            throw error;
        }
    }

    // Set credentials for API calls
    setCredentials(tokens) {
        this.oauth2Client.setCredentials(tokens);
    }

    // Get calendar events (read-only)
    async getEvents(startDate, endDate) {
        try {
            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin: startDate || new Date().toISOString(),
                timeMax: endDate || new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                maxResults: 10,
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = response.data.items || [];
            
            return events.map(event => ({
                id: event.id,
                title: event.summary || 'No Title',
                description: event.description || '',
                start: event.start.dateTime || event.start.date,
                end: event.end.dateTime || event.end.date,
                location: event.location || '',
                allDay: !event.start.dateTime,
                source: 'google'
            }));
        } catch (error) {
            console.error('Error fetching Google Calendar events:', error);
            throw error;
        }
    }

    // Get user's calendar info
    async getCalendarInfo() {
        try {
            const response = await this.calendar.calendars.get({
                calendarId: 'primary'
            });
            
            return {
                id: response.data.id,
                summary: response.data.summary,
                timeZone: response.data.timeZone
            };
        } catch (error) {
            console.error('Error getting calendar info:', error);
            throw error;
        }
    }
}
