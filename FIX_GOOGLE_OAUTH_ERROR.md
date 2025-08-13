# 🔧 Fix Google OAuth Error 401: invalid_client

## 🚨 **Issue Identified**
The Google OAuth credentials are correctly set, but your Google Cloud Console OAuth app needs to be configured for **multiple redirect URIs**.

## 📋 **Root Cause**
- **Public Site**: Uses `http://localhost:3000/auth/google/callback`
- **Private Zone**: Expects `http://localhost:3001/auth/google/callback`
- **Google Cloud Console**: Only configured for one URI

## 🔧 **SOLUTION: Update Google Cloud Console**

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Select your project (the one with your OAuth credentials)
3. Go to: **APIs & Services** → **Credentials**

### Step 2: Edit OAuth 2.0 Client ID
1. Find your OAuth 2.0 Client ID: `249431834427-fqrv2c0vv079cr5tfsmfgc0715gtm8oo.apps.googleusercontent.com`
2. Click the **edit/pencil icon** ✏️
3. In **Authorized redirect URIs**, make sure you have **BOTH**:
   ```
   http://localhost:3000/auth/google/callback
   http://localhost:3001/auth/google/callback
   ```
4. Click **Save**

### Step 3: Alternative - Simplified Approach (RECOMMENDED)
Since both apps use the same Google integration, we should **only use the public-site redirect URI**:

1. **Keep only**: `http://localhost:3000/auth/google/callback`
2. The private-zone-app will receive tokens from public-site (which it already does)

## 🔄 **Quick Fix: Update Private Zone Redirect URI**

I'll update the private-zone-app to use the same redirect URI as public-site:
