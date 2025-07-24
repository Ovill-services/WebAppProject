# Web Application Project - Separated Architecture

This project has been refactored into two separate applications:

## Architecture Overview

### 1. Public Site (`/public-site/`)
- **Port**: 3000
- **Purpose**: Public-facing website with marketing pages and authentication
- **Features**:
  - Homepage, About, Contact, Pricing pages
  - User registration
  - User login
  - Redirects to Private Zone after authentication

### 2. Private Zone App (`/private-zone-app/`)
- **Port**: 3001
- **Purpose**: Authenticated user dashboard and protected features
- **Features**:
  - Dashboard
  - User profile
  - Authentication middleware
  - Session management

## Quick Start

### Option 1: Run Both Apps Simultaneously
```bash
./start-both-apps.sh
```

### Option 2: Run Apps Individually

**Terminal 1 - Public Site:**
```bash
cd public-site
npm install
npm run dev
```

**Terminal 2 - Private Zone App:**
```bash
cd private-zone-app
npm install
npm run dev
```

## Application Flow

1. Users visit the Public Site at `http://localhost:3000`
2. Users can browse marketing pages, register, and login
3. After successful login, users are redirected to the Private Zone App at `http://localhost:3001`
4. The Private Zone App handles all authenticated user features
5. Logout redirects users back to the Public Site

## Technical Details

- Both applications use PostgreSQL to store session data for seamless authentication across apps
- Both applications connect to the same PostgreSQL database
- Session data is shared between both applications using `connect-pg-simple`
- Authentication middleware in Private Zone App protects all routes
- Sessions expire after 24 hours

## Database Configuration

Make sure PostgreSQL is running with the following configuration:
- Host: localhost
- Port: 5433
- Database: Ovill
- User: postgres
- Password: mysecretpassword

## Development

- Both apps use nodemon for development
- Session secret should be the same in both applications
- Database connection settings should match in both applications

## Benefits of This Architecture

1. **Separation of Concerns**: Public marketing site is separate from user dashboard
2. **Scalability**: Each app can be scaled independently
3. **Security**: Private features are completely isolated
4. **Maintenance**: Easier to maintain and deploy separately
5. **Performance**: Smaller bundle sizes for each specific purpose
