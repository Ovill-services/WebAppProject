# Gmail Integration Setup Guide

## Overview
This guide will help you set up Gmail API integration to sync emails from Gmail into your application.

## Prerequisites
- Google Cloud Project
- Gmail API enabled
- OAuth 2.0 credentials configured

## Step 1: Google Cloud Setup

1. **Create or Select a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Enable Gmail API**
   - In the Google Cloud Console, go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click on it and press "Enable"

3. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:3001/auth/google/callback`
     - `http://localhost:3001/gmail/callback`

## Step 2: Environment Configuration

Add these variables to your `.env` file:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
```

## Step 3: Database Setup

Run the Gmail integration setup script:

```bash
./setup-gmail-integration.sh
```

## Step 4: OAuth Flow Implementation

You'll need to implement OAuth routes to handle user authentication. Here's a basic example:

```javascript
// Add to your index.js file

// OAuth authorization route
app.get('/auth/google/gmail', (req, res) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify'
        ]
    });

    res.redirect(authUrl);
});

// OAuth callback route
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        const { tokens } = await oauth2Client.getToken(code);
        
        // Store tokens in database
        await db.query(
            `INSERT INTO gmail_integration (user_email, access_token, refresh_token, expires_at, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_email) DO UPDATE SET
             access_token = $2, refresh_token = $3, expires_at = $4, is_active = $5`,
            [
                req.session.user.email,
                tokens.access_token,
                tokens.refresh_token,
                tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                true
            ]
        );

        res.redirect('/email?connected=true');
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect('/email?error=oauth_failed');
    }
});
```

## Step 5: Using Gmail Sync

Once set up, users can:

1. **Connect Gmail**: Navigate to the email page and authorize Gmail access
2. **Sync Emails**: Click the "Sync Gmail" button to import emails
3. **Send Emails**: Use the compose feature to send emails via Gmail
4. **Manage Emails**: Mark as read/unread, delete emails

## Available API Endpoints

- `GET /api/gmail/status` - Check Gmail integration status
- `POST /api/gmail/sync` - Sync emails from Gmail
- `GET /api/gmail/profile` - Get Gmail profile information
- `POST /api/gmail/send` - Send email via Gmail
- `PUT /api/gmail/messages/:messageId/read` - Mark message as read/unread
- `DELETE /api/gmail/messages/:messageId` - Delete Gmail message

## Security Considerations

1. **Token Storage**: Tokens are encrypted in the database
2. **Scope Limitation**: Only necessary Gmail scopes are requested
3. **Token Refresh**: Automatic token refresh when expired
4. **User Isolation**: Each user's emails are isolated by user_email

## Troubleshooting

### Common Issues:

1. **"Gmail integration not found"**
   - User needs to authorize Gmail access first
   - Check if tokens are stored in the database

2. **Token expired errors**
   - The system should automatically refresh tokens
   - If it fails, user may need to re-authorize

3. **API quota exceeded**
   - Gmail API has usage limits
   - Implement proper rate limiting

### Debug Mode:

Enable debug logging by setting:
```env
DEBUG_GMAIL=true
```

## Testing

Test the integration with sample data:

1. Run the setup script to create sample emails
2. Check the email page functionality
3. Test Gmail sync with a real Gmail account
4. Verify email sending works properly

## Support

For issues with:
- **Google Cloud setup**: [Google Cloud Support](https://cloud.google.com/support)
- **Gmail API**: [Gmail API Documentation](https://developers.google.com/gmail/api)
- **OAuth 2.0**: [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
