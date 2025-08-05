# 🔐 Enable Google OAuth - Step by Step Guide

## 📋 **Prerequisites**
- Google account
- Access to [Google Cloud Console](https://console.cloud.google.com/)

## 🚀 **Step 1: Create Google Cloud Project**

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create New Project** (or select existing):
   - Click "Select a project" dropdown
   - Click "New Project"
   - Project Name: `WebAppProject-OAuth` (or your choice)
   - Click "Create"

## 🔧 **Step 2: Enable Required APIs**

1. **Navigate to APIs & Services** → **Library**
2. **Search and Enable** these APIs:
   - ✅ **Google+ API** (for user profile)
   - ✅ **Google Calendar API** (for calendar integration)
   - ✅ **Google Tasks API** (for tasks integration)

## 🔑 **Step 3: Create OAuth 2.0 Credentials**

1. **Go to**: APIs & Services → **Credentials**
2. **Click**: "+ CREATE CREDENTIALS" → **OAuth 2.0 Client ID**
3. **Configure OAuth consent screen** (if first time):
   - User Type: **External**
   - App name: `Your Web App`
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue** through all steps

4. **Create OAuth Client ID**:
   - Application type: **Web Application**
   - Name: `WebApp OAuth Client`
   - **Authorized redirect URIs**: Add this EXACT URL:
     ```
     http://localhost:3000/auth/google/callback
     ```
   - Click **Create**

5. **Copy Credentials**:
   - You'll see a popup with **Client ID** and **Client Secret**
   - ⚠️ **IMPORTANT**: Copy these values immediately!

## 📝 **Step 4: Update Your .env File**

Replace the disabled values in `/home/oren/test/.env`:

```env
# Replace with your ACTUAL Google OAuth credentials
GOOGLE_CLIENT_ID=your_actual_client_id_from_google.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_actual_client_secret_from_google
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

## 🔄 **Step 5: Restart Application**

After updating .env, run these commands:

```bash
cd /home/oren/test
docker-compose build public-site
docker-compose restart public-site
```

## ✅ **Step 6: Test Google OAuth**

1. **Visit**: http://localhost:3000/login
2. **You should now see**: "Sign in with Google" button
3. **Click it**: Should redirect to Google login
4. **After login**: Should redirect back and create account

## 🛡️ **Security Notes**

- ✅ **Never commit** real credentials to Git
- ✅ **Use environment variables** (already configured)
- ✅ **Keep .env file** private and secure
- ✅ **For production**: Use different credentials

## 🎯 **What You'll Get**

✅ **Google Sign-In Button** appears on login page
✅ **Single-click login** with Google account
✅ **Automatic account creation** for new Google users
✅ **Google Calendar integration** (access tokens stored)
✅ **Google Tasks integration** (access tokens stored)
✅ **Cross-app authentication** (same token system)

## 🔧 **Troubleshooting**

**Button still not showing?**
- Check .env file has real credentials (not "disabled")
- Restart containers after changing .env
- Check container logs: `docker logs public-site`

**OAuth error during login?**
- Verify redirect URI matches exactly
- Check Google Cloud Console project is correct
- Ensure APIs are enabled

**Need help?** 
- Check container logs for detailed error messages
- Google OAuth errors usually show specific error codes

---

**Ready to proceed?** Follow the steps above and let me know when you have your Google OAuth credentials!
