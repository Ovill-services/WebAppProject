// Test script to check Gmail attachments
import { GmailService } from './private-zone-app/services/gmailService.js';
import pkg from 'pg';
const { Client } = pkg;

// Database connection
const db = new Client({
    host: 'localhost',
    port: 5433,
    user: 'postgres',
    password: 'mysecretpassword',
    database: 'Ovill'
});

async function testGmailAttachments() {
    try {
        await db.connect();
        console.log('Connected to database');

        // Get a Gmail integration token
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token FROM gmail_integration WHERE is_active = true LIMIT 1'
        );

        if (tokenResult.rows.length === 0) {
            console.log('No active Gmail integration found');
            return;
        }

        const { access_token, refresh_token } = tokenResult.rows[0];
        
        // Initialize Gmail service
        const gmailService = new GmailService();
        gmailService.setCredentials({ access_token, refresh_token });

        // Get messages
        console.log('Fetching Gmail messages...');
        const messages = await gmailService.getMessages('', 5); // Get 5 messages

        for (const message of messages) {
            console.log(`\n--- Email: ${message.subject} ---`);
            console.log(`From: ${message.from}`);
            console.log(`Attachments: ${message.attachments ? message.attachments.length : 0}`);
            
            if (message.attachments && message.attachments.length > 0) {
                message.attachments.forEach((att, index) => {
                    console.log(`  ${index + 1}. ${att.filename} (${att.mimeType}, ${att.size} bytes)`);
                    console.log(`     Inline: ${att.isInline}, ID: ${att.attachmentId}`);
                });
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.end();
    }
}

testGmailAttachments();
