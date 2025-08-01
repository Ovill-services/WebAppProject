# Private Zone App

This is the authenticated user dashboard application that provides protected features for logged-in users.

## Features
- Dashboard page
- User profile page
- Authentication middleware
- Logout functionality

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm run dev  # For development with nodemon
# or
npm start    # For production
```

The private zone app will be available at http://localhost:3001

## Important Notes
- Users must be authenticated through the Public Site (port 3000) to access this app
- Unauthenticated users are redirected to the Public Site login page
- Logout redirects users back to the Public Site
- Both apps share the same session configuration
