import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

export class GoogleCalendarService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        
        this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    }

    // Generate auth URL for Google Calendar OAuth
    getAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/calendar'
        ];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent'
        });
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

    // Refresh access token
    async refreshAccessToken(refreshToken) {
        try {
            this.oauth2Client.setCredentials({
                refresh_token: refreshToken
            });
            
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            this.oauth2Client.setCredentials(credentials);
            return credentials;
        } catch (error) {
            console.error('Error refreshing access token:', error);
            throw error;
        }
    }

    // Get calendar events
    async getEvents(startDate, endDate) {
        try {
            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin: startDate,
                timeMax: endDate,
                maxResults: 100,
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = response.data.items || [];
            
            // Format events for our calendar
            return events.map(event => ({
                id: event.id,
                title: event.summary || 'No Title',
                description: event.description || '',
                start: event.start.dateTime || event.start.date,
                end: event.end.dateTime || event.end.date,
                location: event.location || '',
                allDay: !event.start.dateTime, // If no time, it's an all-day event
                source: 'google'
            }));
        } catch (error) {
            console.error('Error fetching Google Calendar events:', error);
            throw error;
        }
    }

    // Create a new event
    async createEvent(eventData) {
        try {
            const event = {
                summary: eventData.title,
                description: eventData.description,
                location: eventData.location,
                attendees: eventData.attendees?.map(email => ({ email })) || [],
            };

            // Handle all-day vs timed events
            if (eventData.allDay) {
                // For all-day events, use date format
                event.start = {
                    date: eventData.start,
                    timeZone: 'America/New_York',
                };
                event.end = {
                    date: eventData.end,
                    timeZone: 'America/New_York',
                };
            } else {
                // For timed events, use dateTime format
                event.start = {
                    dateTime: eventData.start,
                    timeZone: 'America/New_York',
                };
                event.end = {
                    dateTime: eventData.end,
                    timeZone: 'America/New_York',
                };
            }

            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                resource: event,
            });

            return {
                id: response.data.id,
                title: response.data.summary,
                start: response.data.start.dateTime || response.data.start.date,
                end: response.data.end.dateTime || response.data.end.date,
                allDay: !response.data.start.dateTime,
                location: response.data.location,
                description: response.data.description,
                source: 'google'
            };
        } catch (error) {
            console.error('Error creating Google Calendar event:', error);
            throw error;
        }
    }

    // Update an existing event
    async updateEvent(eventId, eventData) {
        try {
            const event = {
                summary: eventData.title,
                description: eventData.description,
                location: eventData.location,
                attendees: eventData.attendees?.map(email => ({ email })) || [],
            };

            // Handle all-day vs timed events
            if (eventData.allDay) {
                // For all-day events, use date format
                event.start = {
                    date: eventData.start,
                    timeZone: 'America/New_York',
                };
                event.end = {
                    date: eventData.end,
                    timeZone: 'America/New_York',
                };
            } else {
                // For timed events, use dateTime format
                event.start = {
                    dateTime: eventData.start,
                    timeZone: 'America/New_York',
                };
                event.end = {
                    dateTime: eventData.end,
                    timeZone: 'America/New_York',
                };
            }

            const response = await this.calendar.events.update({
                calendarId: 'primary',
                eventId: eventId,
                resource: event,
            });

            return {
                id: response.data.id,
                title: response.data.summary,
                start: response.data.start.dateTime || response.data.start.date,
                end: response.data.end.dateTime || response.data.end.date,
                allDay: !response.data.start.dateTime,
                location: response.data.location,
                description: response.data.description,
                source: 'google'
            };
        } catch (error) {
            console.error('Error updating Google Calendar event:', error);
            throw error;
        }
    }

    // Delete an event
    async deleteEvent(eventId) {
        try {
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId,
            });
            return { success: true };
        } catch (error) {
            console.error('Error deleting Google Calendar event:', error);
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

    // Check if credentials are valid
    async validateCredentials() {
        try {
            await this.getCalendarInfo();
            return true;
        } catch (error) {
            return false;
        }
    }
}
