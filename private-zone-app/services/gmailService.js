import { google } from 'googleapis';
import fetch from 'node-fetch';
import parseMessageLib from 'gmail-api-parse-message';

// let parseMessageLib = null;
// try {
//     // prefer the dedicated parser when available
//     // eslint-disable-next-line import/no-extraneous-dependencies
//     parseMessageLib = (await import('gmail-api-parse-message')).default;
//     console.log('Using gmail-api-parse-message for email parsing');
// } catch (err) {
//     console.warn('gmail-api-parse-message not available, falling back to builtin parser');
// }

export class GmailService {
    constructor() {
        this.oauth2Client = null;
        this.gmail = null;
    }

    setCredentials(credentials) {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        this.oauth2Client.setCredentials(credentials);
        this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    }

    async refreshAccessToken(refreshToken) {
        try {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );

            oauth2Client.setCredentials({
                refresh_token: refreshToken
            });

            const { credentials } = await oauth2Client.refreshAccessToken();
            return credentials;
        } catch (error) {
            console.error('Error refreshing Gmail access token:', error);
            throw error;
        }
    }

    async getMessages(query = '', maxResults = 50) {
        try {
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: maxResults
            });

            const messages = response.data.messages || [];
            const detailedMessages = [];

            // Get detailed information for each message
            for (const message of messages) {
                try {
                    const messageDetail = await this.gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'full'
                    });

                    const emailData = this.parseEmailData(messageDetail.data);
                    detailedMessages.push(emailData);
                } catch (error) {
                    console.error(`Error fetching message ${message.id}:`, error);
                    // Continue with other messages
                }
            }

            return detailedMessages;
        } catch (error) {
            console.error('Error fetching Gmail messages:', error);
            throw error;
        }
    }

    async getMessage(messageId) {
        try {
            const response = await this.gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full'
            });

            return this.parseEmailData(response.data);
        } catch (error) {
            console.error('Error fetching Gmail message:', error);
            throw error;
        }
    }

    parseEmailData(messageData) {
        // Require the external parser exclusively. Remove legacy parsing logic.
        if (!parseMessageLib) {
            const msg = 'gmail-api-parse-message is required but not available. Please install the dependency in private-zone-app/package.json and run npm install.';
            console.error(msg);
            throw new Error(msg);
        }

        try {
            const parsed = parseMessageLib(messageData);

            // Normalize parsed shape to the expected output used across the app
            return {
                id: messageData.id,
                threadId: messageData.threadId,
                from: parsed.from || parsed.headers?.from || '',
                to: parsed.to || parsed.headers?.to || '',
                cc: parsed.cc || parsed.headers?.cc || '',
                bcc: parsed.bcc || parsed.headers?.bcc || '',
                subject: parsed.subject || parsed.headers?.subject || '',
                body: parsed.html || parsed.text || '',
                htmlBody: parsed.html || null,
                date: parsed.date ? new Date(parsed.date) : (messageData.internalDate ? new Date(parseInt(messageData.internalDate)) : new Date()),
                isRead: !messageData.labelIds?.includes('UNREAD'),
                isImportant: messageData.labelIds?.includes('IMPORTANT') || false,
                labels: messageData.labelIds || [],
                snippet: messageData.snippet || '',
                attachments: parsed.attachments || []
            };
        } catch (err) {
            console.error('gmail-api-parse-message failed:', err);
            throw err;
        }
    }

    async sendMessage(emailData) {
        try {
            const { to, cc, bcc, subject, body } = emailData;

            // Create the email message
            const message = [
                `To: ${to}`,
                cc ? `Cc: ${cc}` : '',
                bcc ? `Bcc: ${bcc}` : '',
                `Subject: ${subject}`,
                '',
                body
            ].filter(line => line !== '').join('\n');

            const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            const response = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error sending Gmail message:', error);
            throw error;
        }
    }

    async markAsRead(messageId) {
        try {
            await this.gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: ['UNREAD']
                }
            });
        } catch (error) {
            console.error('Error marking message as read:', error);
            throw error;
        }
    }

    async markAsUnread(messageId) {
        try {
            await this.gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    addLabelIds: ['UNREAD']
                }
            });
        } catch (error) {
            console.error('Error marking message as unread:', error);
            throw error;
        }
    }

    async deleteMessage(messageId) {
        try {
            await this.gmail.users.messages.delete({
                userId: 'me',
                id: messageId
            });
        } catch (error) {
            console.error('Error deleting Gmail message:', error);
            throw error;
        }
    }

    async getProfile() {
        try {
            const response = await this.gmail.users.getProfile({
                userId: 'me'
            });

            return {
                emailAddress: response.data.emailAddress,
                messagesTotal: response.data.messagesTotal,
                threadsTotal: response.data.threadsTotal,
                historyId: response.data.historyId
            };
        } catch (error) {
            console.error('Error fetching Gmail profile:', error);
            throw error;
        }
    }

    async getAttachment(messageId, attachmentId) {
        try {
            const response = await this.gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: messageId,
                id: attachmentId
            });

            return {
                data: response.data.data,
                size: response.data.size
            };
        } catch (error) {
            console.error('Error fetching Gmail attachment:', error);
            throw error;
        }
    }

    isImageMimeType(mimeType) {
        const imageMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/svg+xml',
            'image/tiff'
        ];
        return imageMimeTypes.includes(mimeType.toLowerCase());
    }
}
