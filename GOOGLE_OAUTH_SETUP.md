# Google OAuth Setup Instructions

## 🚨 Current Issue
Your Google OAuth client ID is returning "Error 401: deleted_client", meaning Google no longer recognizes this client.

## 🔧 Solution: Create New OAuth Client

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Sign in with your Google account
3. Create a new project or select existing one

### Step 2: Create OAuth 2.0 Credentials
1. Go to: **APIs & Services** → **Credentials**
2. Click: **+ CREATE CREDENTIALS**
3. Select: **"OAuth 2.0 Client IDs"**
4. Choose: **"Web application"**

### Step 3: Configure OAuth Client
Fill in these details:
- **Name**: CIVIX Complaint System
- **Authorized JavaScript origins**: `http://127.0.0.1:8000`
- **Authorized redirect URIs**: `http://127.0.0.1:8000`

### Step 4: Get Client ID
After creation, you'll get:
- **Client ID** (looks like: `xxxxxxxxx-xxxxx.apps.googleusercontent.com`)
- **Client Secret** (keep this secure)

### Step 5: Update google-auth.js
Replace line 3 in google-auth.js:
```javascript
this.clientId = "YOUR_NEW_CLIENT_ID_HERE";
```
With your actual client ID.

## 🎯 Quick Fix Template
Once you get your new Client ID, update google-auth.js:

```javascript
class GoogleAuth {
    constructor() {
        this.clientId = "REPLACE_WITH_NEW_CLIENT_ID"; // Your new client ID
        this.apiBase = "http://127.0.0.1:8000/api/";
        this.tokenClient = null;
        this.isRequestInProgress = false;
    }
    // ... rest of code
}
```

## 📱 Testing
After updating:
1. Clear browser cache
2. Restart Django server
3. Try Google login again
4. Check browser console for any errors

## 🔍 Alternative: Test with Google's OAuth Playground
If issues persist, test with:
https://developers.google.com/oauthplayground/

Using the same Client ID and redirect URI to verify it works.
