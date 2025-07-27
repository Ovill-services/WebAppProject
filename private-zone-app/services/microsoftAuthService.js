import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

export class MicrosoftAuthService {
    constructor() {
        // Check if credentials are properly configured
        const clientId = process.env.MICROSOFT_CLIENT_ID;
        const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
        
        if (!clientId || !clientSecret || clientId === 'your_client_id_here' || clientSecret === 'your_client_secret_here') {
            console.warn('⚠️  Microsoft credentials not configured. Microsoft integration will be disabled.');
            console.warn('   Please update your .env file with valid Azure app registration credentials.');
            this.isConfigured = false;
            return;
        }

        this.clientConfig = {
            auth: {
                clientId: clientId,
                clientSecret: clientSecret,
                authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`
            },
            system: {
                loggerOptions: {
                    loggerCallback(loglevel, message, containsPii) {
                        console.log(message);
                    },
                    piiLoggingEnabled: false,
                    logLevel: 3, // Info level
                }
            }
        };

        try {
            this.cca = new ConfidentialClientApplication(this.clientConfig);
            this.redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/auth/microsoft/callback';
            this.isConfigured = true;
            console.log('✅ Microsoft Auth Service initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Microsoft Auth Service:', error.message);
            this.isConfigured = false;
        }
    }

    // Check if service is properly configured
    checkConfiguration() {
        return this.isConfigured;
    }

    // Get authorization URL
    getAuthUrl(scopes = ['https://graph.microsoft.com/Calendars.ReadWrite', 'https://graph.microsoft.com/User.Read']) {
        if (!this.isConfigured) {
            throw new Error('Microsoft Auth Service not configured');
        }

        const authCodeUrlParameters = {
            scopes: scopes,
            redirectUri: this.redirectUri,
        };

        return this.cca.getAuthCodeUrl(authCodeUrlParameters);
    }

    // Exchange authorization code for access token
    async getTokenFromCode(code) {
        if (!this.isConfigured) {
            throw new Error('Microsoft Auth Service not configured');
        }

        try {
            const tokenRequest = {
                code: code,
                scopes: ['https://graph.microsoft.com/Calendars.ReadWrite', 'https://graph.microsoft.com/User.Read'],
                redirectUri: this.redirectUri,
            };

            const response = await this.cca.acquireTokenByCode(tokenRequest);
            return {
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                expiresOn: response.expiresOn,
                account: response.account
            };
        } catch (error) {
            console.error('Error exchanging code for token:', error);
            throw error;
        }
    }

    // Refresh access token
    async refreshAccessToken(refreshToken, account) {
        if (!this.isConfigured) {
            throw new Error('Microsoft Auth Service not configured');
        }

        try {
            const refreshTokenRequest = {
                refreshToken: refreshToken,
                scopes: ['https://graph.microsoft.com/Calendars.ReadWrite', 'https://graph.microsoft.com/User.Read'],
                account: account
            };

            const response = await this.cca.acquireTokenByRefreshToken(refreshTokenRequest);
            return {
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                expiresOn: response.expiresOn
            };
        } catch (error) {
            console.error('Error refreshing token:', error);
            throw error;
        }
    }

    // Validate access token
    async validateToken(accessToken) {
        try {
            const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    // Get user info from token
    async getUserInfo(accessToken) {
        try {
            const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error getting user info:', error);
            throw error;
        }
    }
}
