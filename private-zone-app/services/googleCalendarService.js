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
            return events.map(event => {
                const isRecurring = !!(event.recurringEventId || event.recurrence);
                console.log(`Event "${event.summary}": recurringEventId=${event.recurringEventId}, recurrence=${!!event.recurrence}, isRecurring=${isRecurring}`);
                
                return {
                    id: event.id,
                    title: event.summary || 'No Title',
                    description: event.description || '',
                    start: event.start.dateTime || event.start.date,
                    end: event.end.dateTime || event.end.date,
                    location: event.location || '',
                    allDay: !event.start.dateTime, // If no time, it's an all-day event
                    recurring: isRecurring, // Check if it's a recurring event
                    source: 'google'
                };
            });
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
                event.start = {
                    date: eventData.start,
                    timeZone: 'America/New_York',
                };
                event.end = {
                    date: eventData.end,
                    timeZone: 'America/New_York',
                };
            } else {
                event.start = {
                    dateTime: eventData.start,
                    timeZone: 'America/New_York',
                };
                event.end = {
                    dateTime: eventData.end,
                    timeZone: 'America/New_York',
                };
            }

            // Add recurrence rule if recurring
            if (eventData.recurring && eventData.recurringType) {
                let freq = '';
                switch (eventData.recurringType) {
                    case 'daily': freq = 'DAILY'; break;
                    case 'weekly': freq = 'WEEKLY'; break;
                    case 'monthly': freq = 'MONTHLY'; break;
                    case 'yearly': freq = 'YEARLY'; break;
                }
                if (freq) {
                    let rrule = `RRULE:FREQ=${freq}`;
                    if (eventData.recurringEnd) {
                        // Google expects UNTIL in YYYYMMDDT235959Z format
                        const until = eventData.recurringEnd.replace(/-/g, '') + 'T235959Z';
                        rrule += `;UNTIL=${until}`;
                    }
                    event.recurrence = [rrule];
                }
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

            // Handle recurring event editing scope
            console.log(`Updating event ${eventId} with scope: ${eventData.recurringEditScope}`);

            if (eventData.recurringEditScope === 'all') {
                // Edit all events in series - update the master event
                console.log('Updating entire recurring series');
                
                // Get event details to find master event if this is an instance
                const eventDetails = await this.calendar.events.get({
                    calendarId: 'primary',
                    eventId: eventId
                });

                let masterEventId = eventId;
                if (eventDetails.data.recurringEventId) {
                    // This is an instance, update the master event
                    masterEventId = eventDetails.data.recurringEventId;
                    console.log(`Updating master event ID: ${masterEventId}`);
                }

                const response = await this.calendar.events.update({
                    calendarId: 'primary',
                    eventId: masterEventId,
                    resource: event,
                    sendUpdates: 'all'
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
                
            } else if (eventData.recurringEditScope === 'future') {
                // Edit this and future events - complex operation
                console.log('Updating this and future events (complex operation)');
                
                // For now, we'll update only this instance as implementing 
                // "this and future" requires splitting the recurring series
                console.log('Note: "This and future" editing not fully implemented - updating single instance');
                
                const response = await this.calendar.events.update({
                    calendarId: 'primary',
                    eventId: eventId,
                    resource: event,
                    sendUpdates: 'none'
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
                
            } else {
                // Edit only this instance
                console.log('Updating single instance');
                
                const response = await this.calendar.events.update({
                    calendarId: 'primary',
                    eventId: eventId,
                    resource: event,
                    sendUpdates: 'none'
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
            }
        } catch (error) {
            console.error('Error updating Google Calendar event:', error);
            throw error;
        }
    }

    // Delete an event
    async deleteEvent(eventId, recurringEditScope) {
        try {
            console.log(`Deleting event ${eventId} with scope: ${recurringEditScope}`);

            if (recurringEditScope === 'all') {
                // Delete all events in series - delete the master event
                console.log('Deleting entire recurring series');
                
                // For recurring events, we need to find and delete the master event
                // If this is an instance, we need to get the recurring event ID
                const eventDetails = await this.calendar.events.get({
                    calendarId: 'primary',
                    eventId: eventId
                });

                let masterEventId = eventId;
                if (eventDetails.data.recurringEventId) {
                    // This is an instance, get the master event ID
                    masterEventId = eventDetails.data.recurringEventId;
                    console.log(`Found master event ID: ${masterEventId}`);
                }

                await this.calendar.events.delete({
                    calendarId: 'primary',
                    eventId: masterEventId,
                    sendUpdates: 'all'
                });
                
            } else if (recurringEditScope === 'future') {
                // Delete this and future events - modify the recurrence rule
                console.log('Deleting this and future events (modifying recurrence)');
                
                // Get the event details
                const eventDetails = await this.calendar.events.get({
                    calendarId: 'primary',
                    eventId: eventId
                });

                if (eventDetails.data.recurringEventId) {
                    // This is an instance of a recurring event
                    const masterEventId = eventDetails.data.recurringEventId;
                    const instanceDate = eventDetails.data.start.dateTime || eventDetails.data.start.date;
                    
                    // Get the master event
                    const masterEvent = await this.calendar.events.get({
                        calendarId: 'primary',
                        eventId: masterEventId
                    });

                    // Calculate the date before this instance
                    const endDate = new Date(instanceDate);
                    endDate.setDate(endDate.getDate() - 1);
                    const until = endDate.toISOString().split('T')[0].replace(/-/g, '') + 'T235959Z';

                    // Update the master event to end before this instance
                    if (masterEvent.data.recurrence && masterEvent.data.recurrence.length > 0) {
                        let updatedRecurrence = masterEvent.data.recurrence[0];
                        // Remove existing UNTIL if present
                        updatedRecurrence = updatedRecurrence.replace(/;UNTIL=[^;]*/, '');
                        // Add new UNTIL
                        updatedRecurrence += `;UNTIL=${until}`;

                        await this.calendar.events.update({
                            calendarId: 'primary',
                            eventId: masterEventId,
                            resource: {
                                ...masterEvent.data,
                                recurrence: [updatedRecurrence]
                            },
                            sendUpdates: 'all'
                        });
                    }
                } else {
                    // This is the master event itself
                    console.log('Cannot delete future events from master event - deleting entire series instead');
                    await this.calendar.events.delete({
                        calendarId: 'primary',
                        eventId: eventId,
                        sendUpdates: 'all'
                    });
                }
                
            } else {
                // Delete only this instance
                console.log('Deleting single instance');
                await this.calendar.events.delete({
                    calendarId: 'primary',
                    eventId: eventId,
                    sendUpdates: 'none'
                });
            }

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
