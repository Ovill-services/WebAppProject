import { google } from 'googleapis';
import fetch from 'node-fetch';

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
        const headers = messageData.payload.headers;
        const getHeader = (name) => {
            const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
            return header ? header.value : '';
        };

        // Extract email body and attachments
        let body = '';
        let htmlBody = '';
        const attachments = [];

        const extractContent = (payload, parentContentId = null) => {
            // Handle attachments - check for filename or attachmentId
            if ((payload.filename && payload.filename.length > 0) ||
                (payload.body && payload.body.attachmentId)) {

                const attachment = {
                    filename: payload.filename || 'unnamed_attachment',
                    mimeType: payload.mimeType || 'application/octet-stream',
                    size: payload.body?.size || 0,
                    attachmentId: payload.body?.attachmentId,
                    contentId: null,
                    isInline: false
                };

                // Check headers for Content-ID and Content-Disposition
                if (payload.headers) {
                    const contentIdHeader = payload.headers.find(h => h.name.toLowerCase() === 'content-id');
                    const contentDispositionHeader = payload.headers.find(h => h.name.toLowerCase() === 'content-disposition');

                    if (contentIdHeader) {
                        attachment.contentId = contentIdHeader.value;
                    }

                    if (contentDispositionHeader && contentDispositionHeader.value.toLowerCase().includes('inline')) {
                        attachment.isInline = true;
                    }
                }

                attachments.push(attachment);
                return;
            }

            // Handle body content
            if (payload.body && payload.body.data) {
                let base64EncodedString = payload.body.data
                    .replace(/-/g, '+')
                    .replace(/_/g, '/');
                const content = Buffer.from(base64EncodedString, 'base64').toString();
                if (payload.mimeType === 'text/plain') {
                    body = content;
                } else if (payload.mimeType === 'text/html') {
                    htmlBody = content;
                }
                return;
            }

            // Process nested parts
            if (payload.parts) {
                for (const part of payload.parts) {
                    extractContent(part, parentContentId);
                }
            }
        };

        extractContent(messageData.payload);

        // Prefer HTML content for rich display, fallback to plain text
        let finalBody = htmlBody || body;
        
        // If we only have plain text, use it as is
        if (!htmlBody && body) {
            finalBody = body;
        }
        
        // If we have HTML content, preserve it for rich display
        if (htmlBody) {
            // Only do minimal cleanup for display issues, preserve HTML structure
            finalBody = htmlBody
                // Fix common encoding issues but preserve HTML tags
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'")
                // Decode basic URL encoding if present
                .replace(/%20/g, ' ')
                .replace(/%3A/g, ':')
                .replace(/%2F/g, '/')
                .replace(/%3F/g, '?')
                .replace(/%3D/g, '=')
                .replace(/%26/g, '&');
        }

        // Get the actual email date from headers (when email was originally sent)
        // Fall back to internalDate (when Gmail received it) if Date header is missing
        const dateHeader = getHeader('Date');
        let emailDate;
        if (dateHeader) {
            try {
                emailDate = new Date(dateHeader);
                // Validate that the parsed date is reasonable
                if (isNaN(emailDate.getTime()) || emailDate.getTime() < 0) {
                    console.log(`Invalid Date header "${dateHeader}", falling back to internalDate`);
                    emailDate = new Date(parseInt(messageData.internalDate));
                }
            } catch (error) {
                console.log(`Error parsing Date header "${dateHeader}", falling back to internalDate:`, error);
                emailDate = new Date(parseInt(messageData.internalDate));
            }
        } else {
            console.log('No Date header found, using internalDate');
            emailDate = new Date(parseInt(messageData.internalDate));
        }

        return {
            id: messageData.id,
            threadId: messageData.threadId,
            from: getHeader('From'),
            to: getHeader('To'),
            cc: getHeader('Cc'),
            bcc: getHeader('Bcc'),
            subject: getHeader('Subject'),
            body: finalBody || '',
            htmlBody: htmlBody, // Keep HTML version for rich display
            date: emailDate,
            isRead: !messageData.labelIds?.includes('UNREAD'),
            isImportant: messageData.labelIds?.includes('IMPORTANT') || false,
            labels: messageData.labelIds || [],
            snippet: messageData.snippet || '',
            attachments: attachments
        };
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
