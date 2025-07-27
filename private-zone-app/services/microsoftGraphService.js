import { Client } from '@microsoft/microsoft-graph-client';

class CustomAuthProvider {
    constructor(accessToken) {
        this.accessToken = accessToken;
    }

    async getAccessToken() {
        return this.accessToken;
    }
}

export class MicrosoftGraphService {
    constructor(accessToken) {
        const authProvider = new CustomAuthProvider(accessToken);
        this.graphClient = Client.initWithMiddleware({ authProvider });
    }

    // Get user's calendar events
    async getCalendarEvents(startDate, endDate) {
        try {
            const events = await this.graphClient
                .api('/me/events')
                .filter(`start/dateTime ge '${startDate}' and end/dateTime le '${endDate}'`)
                .select('subject,start,end,bodyPreview,location,organizer,attendees,importance,showAs')
                .orderby('start/dateTime')
                .get();

            return events.value.map(event => ({
                id: event.id,
                title: event.subject,
                start: new Date(event.start.dateTime),
                end: new Date(event.end.dateTime),
                description: event.bodyPreview,
                location: event.location?.displayName || '',
                organizer: event.organizer?.emailAddress?.name || '',
                attendees: event.attendees?.map(a => a.emailAddress?.name) || [],
                importance: event.importance,
                showAs: event.showAs,
                source: 'outlook'
            }));
        } catch (error) {
            console.error('Error fetching calendar events:', error);
            throw error;
        }
    }

    // Create a new calendar event
    async createEvent(eventData) {
        try {
            const event = {
                subject: eventData.title,
                body: {
                    contentType: 'text',
                    content: eventData.description || ''
                },
                start: {
                    dateTime: eventData.start.toISOString(),
                    timeZone: 'UTC'
                },
                end: {
                    dateTime: eventData.end.toISOString(),
                    timeZone: 'UTC'
                },
                location: {
                    displayName: eventData.location || ''
                },
                attendees: eventData.attendees?.map(email => ({
                    emailAddress: {
                        address: email,
                        name: email
                    }
                })) || []
            };

            const createdEvent = await this.graphClient
                .api('/me/events')
                .post(event);

            return {
                id: createdEvent.id,
                title: createdEvent.subject,
                start: new Date(createdEvent.start.dateTime),
                end: new Date(createdEvent.end.dateTime),
                source: 'outlook'
            };
        } catch (error) {
            console.error('Error creating calendar event:', error);
            throw error;
        }
    }

    // Update an existing event
    async updateEvent(eventId, eventData) {
        try {
            const event = {
                subject: eventData.title,
                body: {
                    contentType: 'text',
                    content: eventData.description || ''
                },
                start: {
                    dateTime: eventData.start.toISOString(),
                    timeZone: 'UTC'
                },
                end: {
                    dateTime: eventData.end.toISOString(),
                    timeZone: 'UTC'
                },
                location: {
                    displayName: eventData.location || ''
                }
            };

            await this.graphClient
                .api(`/me/events/${eventId}`)
                .patch(event);

            return { success: true };
        } catch (error) {
            console.error('Error updating calendar event:', error);
            throw error;
        }
    }

    // Delete an event
    async deleteEvent(eventId) {
        try {
            await this.graphClient
                .api(`/me/events/${eventId}`)
                .delete();

            return { success: true };
        } catch (error) {
            console.error('Error deleting calendar event:', error);
            throw error;
        }
    }

    // Get user profile information
    async getUserProfile() {
        try {
            const user = await this.graphClient
                .api('/me')
                .select('displayName,mail,userPrincipalName,jobTitle,department')
                .get();

            return {
                name: user.displayName,
                email: user.mail || user.userPrincipalName,
                jobTitle: user.jobTitle,
                department: user.department
            };
        } catch (error) {
            console.error('Error fetching user profile:', error);
            throw error;
        }
    }
}
