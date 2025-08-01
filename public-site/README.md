# Public Site

This is the public-facing website that handles marketing pages, user registration, and authentication.

## Features
- Homepage, About, Contact, Pricing pages
- User registration
- User login (redirects to Private Zone App after successful authentication)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Make sure PostgreSQL is running with the database configured in `index.js`

3. Start the server:
```bash
npm run dev  # For development with nodemon
# or
npm start    # For production
```

The public site will be available at http://localhost:3000

## Important Notes
- After successful login, users are redirected to the Private Zone App (port 3001)
- Make sure both applications are running for the full user experience
- Both apps share the same session configuration and database
