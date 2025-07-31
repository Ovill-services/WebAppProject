// Gmail OAuth Routes
// Add these routes to your main index.js file

import { google } from 'googleapis';

// OAuth authorization route for Gmail
app.get('/auth/google/gmail', requireAuth, (req, res) => {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback'
        );

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify',
                'https://www.googleapis.com/auth/userinfo.email'
            ],
            prompt: 'consent' // Force consent screen to get refresh token
        });

        res.redirect(authUrl);
    } catch (error) {
        console.error('Gmail OAuth authorization error:', error);
        res.redirect('/email?error=auth_failed');
    }
});

// OAuth callback route for Gmail
app.get('/auth/google/callback', async (req, res) => {
    const { code, error } = req.query;
    
    if (error) {
        console.error('OAuth error:', error);
        return res.redirect('/email?error=oauth_denied');
    }

    if (!code) {
        return res.redirect('/email?error=no_auth_code');
    }
    
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback'
        );

        // Exchange authorization code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        
        // Get user's Gmail email address
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const gmailEmail = userInfo.data.email;
        
        // Store tokens in database
        const query = `
            INSERT INTO gmail_integration (user_email, access_token, refresh_token, expires_at, gmail_email, is_active)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (user_email) DO UPDATE SET
                access_token = $2, 
                refresh_token = $3, 
                expires_at = $4, 
                gmail_email = $5, 
                is_active = $6,
                updated_at = CURRENT_TIMESTAMP
        `;
        
        const values = [
            req.session.user.email,
            tokens.access_token,
            tokens.refresh_token,
            tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            gmailEmail,
            true
        ];
        
        await db.query(query, values);

        console.log(`Gmail integration successful for user: ${req.session.user.email}`);
        res.redirect('/email?connected=true');
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect('/email?error=oauth_failed');
    }
});

// Disconnect Gmail integration
app.post('/api/gmail/disconnect', requireAuth, async (req, res) => {
    try {
        await db.query(
            'UPDATE gmail_integration SET is_active = false WHERE user_email = $1',
            [req.session.user.email]
        );
        
        res.json({
            success: true,
            message: 'Gmail integration disconnected successfully'
        });
    } catch (error) {
        console.error('Error disconnecting Gmail:', error);
        res.status(500).json({
            success: false,
            message: 'Error disconnecting Gmail integration'
        });
    }
});

// Test Gmail connection
app.get('/api/gmail/test', requireAuth, async (req, res) => {
    try {
        // Get user's Gmail tokens
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token, expires_at, gmail_email FROM gmail_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Gmail integration not found' });
        }
        
        let { access_token, refresh_token, expires_at, gmail_email } = tokenResult.rows[0];
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await gmailService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : null;
                await db.query(
                    'UPDATE gmail_integration SET access_token = $1, expires_at = $2 WHERE user_email = $3',
                    [refreshedTokens.access_token, newExpiresAt, req.session.user.email]
                );
            } catch (refreshError) {
                console.error('Error refreshing Gmail token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Gmail token' });
            }
        }
        
        // Test Gmail connection by getting profile
        gmailService.setCredentials({ access_token, refresh_token });
        const profile = await gmailService.getProfile();
        
        res.json({
            success: true,
            connected: true,
            gmailEmail: gmail_email,
            profile: profile,
            message: 'Gmail connection is working correctly'
        });
        
    } catch (error) {
        console.error('Gmail connection test failed:', error);
        res.status(500).json({
            success: false,
            connected: false,
            error: 'Gmail connection test failed'
        });
    }
});
