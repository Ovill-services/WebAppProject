# Microsoft Outlook Calendar Integration Setup Guide

## Overview
This guide will help you set up Microsoft Outlook integration for your calendar application, allowing users to sync their Outlook calendars and events.

## Prerequisites
- An Azure Active Directory (Azure AD) tenant
- Administrative access to register applications in Azure AD
- The application already running on `http://localhost:3001`

## Step 1: Register Your Application in Azure Portal

### 1.1 Navigate to Azure Portal
1. Go to [Azure Portal](https://portal.azure.com)
2. Sign in with your Microsoft account that has admin privileges

### 1.2 Register a New Application
1. Search for "Azure Active Directory" and select it
2. Go to "App registrations" in the left sidebar
3. Click "New registration"
4. Fill out the form:
   - **Name**: "Calendar App - Private Zone"
   - **Supported account types**: Choose based on your needs:
     - "Accounts in this organizational directory only" (Single tenant)
     - "Accounts in any organizational directory" (Multi-tenant)
     - "Accounts in any organizational directory and personal Microsoft accounts" (Multi-tenant + personal)
   - **Redirect URI**: 
     - Platform: Web
     - URI: `http://localhost:3001/auth/microsoft/callback`
5. Click "Register"

### 1.3 Note Down the Application Details
After registration, you'll see the application overview page. Copy these values:
- **Application (client) ID**: This is your `MICROSOFT_CLIENT_ID`
- **Directory (tenant) ID**: This is your `MICROSOFT_TENANT_ID`

## Step 2: Create a Client Secret

### 2.1 Generate Client Secret
1. In your app registration, go to "Certificates & secrets"
2. Click "New client secret"
3. Add a description: "Calendar App Secret"
4. Choose expiration period (recommend 24 months for development)
5. Click "Add"
6. **Important**: Copy the secret value immediately - this is your `MICROSOFT_CLIENT_SECRET`
   (You won't be able to see it again after leaving this page)

## Step 3: Configure API Permissions

### 3.1 Add Microsoft Graph Permissions
1. Go to "API permissions" in your app registration
2. Click "Add a permission"
3. Select "Microsoft Graph"
4. Choose "Delegated permissions"
5. Add these permissions:
   - `User.Read` (to read user profile)
   - `Calendars.ReadWrite` (to read and write calendar events)
6. Click "Add permissions"

### 3.2 Grant Admin Consent (Optional but Recommended)
1. Click "Grant admin consent for [Your Organization]"
2. Click "Yes" to confirm
3. This prevents users from seeing consent prompts

## Step 4: Update Environment Configuration

### 4.1 Update the .env File
Open the `.env` file in your project and update these values:

```env
# Microsoft Graph API Configuration
MICROSOFT_CLIENT_ID=your_application_client_id_here
MICROSOFT_CLIENT_SECRET=your_client_secret_here
MICROSOFT_TENANT_ID=your_tenant_id_here
MICROSOFT_REDIRECT_URI=http://localhost:3001/auth/microsoft/callback
```

Replace the placeholder values with the actual values from your Azure app registration.

### 4.2 For Multi-Tenant Applications
If you want to support personal Microsoft accounts and work/school accounts from any organization, use:
```env
MICROSOFT_TENANT_ID=common
```

If you want to support only work/school accounts from any organization:
```env
MICROSOFT_TENANT_ID=organizations
```

If you want to support only personal Microsoft accounts:
```env
MICROSOFT_TENANT_ID=consumers
```

## Step 5: Test the Integration

### 5.1 Start Your Application
```bash
cd /home/oren/test/private-zone-app
npm run dev
```

### 5.2 Test the Flow
1. Navigate to `http://localhost:3001/calendar`
2. Click the "Microsoft Outlook" button
3. You should be redirected to Microsoft's login page
4. Sign in with your Microsoft account
5. Grant permissions when prompted
6. You should be redirected back to your calendar with a success message

## Step 6: Production Considerations

### 6.1 Update Redirect URI for Production
When deploying to production, update the redirect URI in both:
1. Azure app registration settings
2. Your production environment variables

### 6.2 Security Best Practices
- Use environment variables for all secrets
- Never commit secrets to version control
- Use HTTPS in production
- Consider using Azure Key Vault for secret management
- Implement proper error handling and logging
- Set appropriate token expiration times

### 6.3 Monitoring and Logging
- Monitor API usage in Azure Portal
- Implement logging for authentication events
- Set up alerts for failed authentications

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI" error**
   - Ensure the redirect URI in Azure exactly matches your callback URL
   - Check for trailing slashes or typos

2. **"Invalid client" error**
   - Verify your client ID and secret are correct
   - Ensure the secret hasn't expired

3. **"Insufficient privileges" error**
   - Check that all required permissions are granted
   - Ensure admin consent is provided if required

4. **Token refresh failures**
   - Check that the refresh token is stored correctly
   - Verify token expiration handling

### Debug Tips
- Enable detailed logging in your application
- Use browser developer tools to inspect network requests
- Check Azure AD sign-in logs for authentication issues

## Additional Features

### Available API Endpoints
- `GET /api/microsoft/status` - Check connection status
- `GET /api/microsoft/events` - Get calendar events
- `POST /api/microsoft/events` - Create new events
- `POST /api/microsoft/disconnect` - Disconnect integration

### Extending Functionality
You can extend this integration to support:
- Event updates and deletions
- Multiple calendar support
- Recurring events
- Meeting invitations
- Push notifications
- Contact synchronization

## Support
For issues with this integration:
1. Check the application logs
2. Verify Azure app registration settings
3. Test with different Microsoft accounts
4. Check Microsoft Graph API documentation

## References
- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/)
- [Azure AD App Registration Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Microsoft Graph Calendar API](https://docs.microsoft.com/en-us/graph/api/resources/calendar)
