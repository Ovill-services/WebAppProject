import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import bodyParser from 'body-parser';
import { MongoClient, ObjectId } from 'mongodb';
import MongoStore from 'connect-mongo';
import multer from 'multer';
import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import moment from 'moment';
import { GoogleCalendarService } from './services/googleCalendarService.js';
import { GmailService } from './services/gmailService.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Google Calendar Service
const googleCalendarService = new GoogleCalendarService();

// Initialize Gmail Service
const gmailService = new GmailService();

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:secretpassword@mongodb:27017/private_zone?authSource=admin';
const client = new MongoClient(mongoUri);
let db;

const app = express();
const port = 3001;

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

// MongoDB session store
app.use(session({
  store: MongoStore.create({
    mongoUrl: mongoUri,
    collectionName: 'sessions'
  }),
  name: 'private-zone-session',
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, 'public/uploads/avatars');
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp and original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, 'avatar-' + uniqueSuffix + extension);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to check authentication or validate token
async function requireAuth(req, res, next) {
    console.log('requireAuth called, URL:', req.originalUrl);
    console.log('Session user:', req.session?.user);
    console.log('Token from query:', req.query.token ? req.query.token.substring(0, 8) + '...' : 'none');
    
    // Check if user is already authenticated
    if (req.session && req.session.user) {
        console.log('User already authenticated via session');
        return next();
    }
    
    // Check for authentication token from query parameter
    const token = req.query.token;
    if (token) {
        console.log('Attempting token verification...');
        try {
            // Verify token and get user info
            const tempToken = await db.collection('temp_auth_tokens').findOne({
                token: token,
                expires_at: { $gt: new Date() }
            });
            
            console.log('Token query result:', tempToken ? 'found' : 'not found');
            
            if (tempToken) {
                const user = await db.collection('users').findOne({
                    username: tempToken.user_username
                });
                
                if (user) {
                    console.log('Token verified for user:', user.username);
                    
                    // Set session
                    req.session.user = {
                        email: user.username, // Use username as email for consistency
                        name: user.name
                    };
                    
                    // Delete the used token
                    await db.collection('temp_auth_tokens').deleteOne({ token: token });
                    
                    console.log('User authenticated via token:', req.session.user);
                    
                    // Redirect to clean URL without token
                    const cleanUrl = req.originalUrl.split('?')[0];
                    return res.redirect(cleanUrl);
                }
            } else {
                console.log('Token not found or expired');
            }
        } catch (error) {
            console.error('Token verification error:', error);
        }
    }
    
    console.log('Redirecting to login - no valid session or token');
    // Redirect to public site login
    res.redirect('http://localhost:3000/login');
}

// API Routes for Google Calendar (status and events only)

// Get Google Calendar integration status
app.get('/api/google/calendar/status', requireAuth, async (req, res) => {
    try {
        const integration = await db.collection('google_calendar_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        const isConnected = !!integration;
        res.json({ 
            connected: isConnected,
            connectedSince: isConnected ? integration.created_at : null,
            calendarInfo: isConnected ? integration.calendar_info : null
        });
    } catch (error) {
        console.error('Error checking Google Calendar status:', error);
        res.status(500).json({ 
            connected: false,
            error: 'Failed to check status' 
        });
    }
});

// Get calendar events from Google Calendar
app.get('/api/google/calendar/events', requireAuth, async (req, res) => {
    try {
        const { start, end } = req.query;
        
        // Get user's Google Calendar tokens
        const integration = await db.collection('google_calendar_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = integration;
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : moment().add(1, 'hour').toDate();
                await db.collection('google_calendar_integration').updateOne(
                    { user_email: req.session.user.email },
                    { 
                        $set: { 
                            access_token: refreshedTokens.access_token, 
                            expires_at: newExpiresAt 
                        } 
                    }
                );
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Google Calendar token' });
            }
        }
        
        // Set credentials and get events
        googleCalendarService.setCredentials({ access_token, refresh_token });
        const startDate = start || new Date().toISOString();
        const endDate = end || new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days from now
        
        const events = await googleCalendarService.getEvents(startDate, endDate);
        
        // Sync events to local database
        await syncGoogleCalendarEvents(req.session.user.email, events);
        
        res.json({ success: true, events });
        
    } catch (error) {
        console.error('Error fetching Google Calendar events:', error);
        res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
});

// Function to sync Google Calendar events to local database
async function syncGoogleCalendarEvents(userEmail, googleEvents) {
    try {
        console.log(`Syncing ${googleEvents.length} Google Calendar events for user: ${userEmail}`);
        
        for (const googleEvent of googleEvents) {
            try {
                // Skip events without proper time data
                if (!googleEvent.start || !googleEvent.end) {
                    console.log('Skipping event without start/end time:', googleEvent.id);
                    continue;
                }
                
                // Handle all-day events and timed events
                const startTime = googleEvent.start;
                const endTime = googleEvent.end;
                const isAllDay = googleEvent.allDay || false;
                
                // Check if event already exists in local database
                const existingEvent = await db.collection('calendar_events').findOne({
                    user_email: userEmail,
                    google_event_id: googleEvent.id
                });
                
                const eventData = {
                    title: googleEvent.title || 'Untitled Event',
                    description: googleEvent.description || null,
                    start_time: new Date(startTime),
                    end_time: new Date(endTime),
                    location: googleEvent.location || null,
                    is_all_day: isAllDay,
                    updated_at: new Date()
                };
                
                if (existingEvent) {
                    // Update existing event
                    await db.collection('calendar_events').updateOne(
                        { user_email: userEmail, google_event_id: googleEvent.id },
                        { $set: eventData }
                    );
                    console.log(`Updated Google Calendar event: ${googleEvent.title || googleEvent.id}`);
                } else {
                    // Insert new event
                    await db.collection('calendar_events').insertOne({
                        ...eventData,
                        user_email: userEmail,
                        event_type: 'google_calendar',
                        google_event_id: googleEvent.id,
                        created_at: new Date()
                    });
                    console.log(`Inserted Google Calendar event: ${googleEvent.title || googleEvent.id}`);
                }
                
            } catch (eventError) {
                console.error(`Error syncing individual event ${googleEvent.id}:`, eventError);
                // Continue with other events
            }
        }
        
        console.log('Google Calendar events sync completed');
    } catch (error) {
        console.error('Error syncing Google Calendar events:', error);
        throw error;
    }
}

// Sync Google Calendar events to local database
app.post('/api/google/calendar/sync', requireAuth, async (req, res) => {
    try {
        // Get user's Google Calendar tokens
        const integration = await db.collection('google_calendar_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = integration;
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : moment().add(1, 'hour').toDate();
                await db.collection('google_calendar_integration').updateOne(
                    { user_email: req.session.user.email },
                    { 
                        $set: { 
                            access_token: refreshedTokens.access_token, 
                            expires_at: newExpiresAt 
                        } 
                    }
                );
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Google Calendar token' });
            }
        }
        
        // Set credentials and get events (next 90 days)
        googleCalendarService.setCredentials({ access_token, refresh_token });
        const startDate = new Date().toISOString();
        const endDate = new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days from now
        
        const events = await googleCalendarService.getEvents(startDate, endDate);
        
        // Sync events to local database
        await syncGoogleCalendarEvents(req.session.user.email, events);
        
        res.json({ 
            success: true, 
            message: `Successfully synced ${events.length} Google Calendar events`,
            syncedCount: events.length
        });
        
    } catch (error) {
        console.error('Error syncing Google Calendar events:', error);
        res.status(500).json({ error: 'Failed to sync calendar events' });
    }
});

// Create event in Google Calendar
app.post('/api/google/calendar/events', requireAuth, async (req, res) => {
    try {
        const { title, description, start, end, location, attendees } = req.body;
        
        // Get user's Google Calendar tokens
        const integration = await db.collection('google_calendar_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        const { access_token, refresh_token } = integration;
        
        // Create event
        googleCalendarService.setCredentials({ access_token, refresh_token });
        const eventData = {
            title,
            description,
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            location,
            attendees: attendees || []
        };
        
        const createdEvent = await googleCalendarService.createEvent(eventData);
        res.json({ success: true, event: createdEvent });
        
    } catch (error) {
        console.error('Error creating Google Calendar event:', error);
        res.status(500).json({ error: 'Failed to create calendar event' });
    }
});

// Calendar page route for creating events (alternative endpoint)
app.post('/calendar/create-event', requireAuth, async (req, res) => {
    try {
        const { title, description, start, end, location, allDay, recurring, recurringType, recurringEnd } = req.body;
        
        // Get user's Google Calendar tokens
        const integration = await db.collection('google_calendar_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = integration;
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : moment().add(1, 'hour').toDate();
                await db.collection('google_calendar_integration').updateOne(
                    { user_email: req.session.user.email },
                    { 
                        $set: { 
                            access_token: refreshedTokens.access_token, 
                            expires_at: newExpiresAt 
                        } 
                    }
                );
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Google Calendar token' });
            }
        }
        
        // Set credentials and create event
        googleCalendarService.setCredentials({ access_token, refresh_token });
        
        let startDate, endDate;
        if (allDay) {
            // For all-day events, use date format without time
            startDate = start;
            endDate = end;
        } else {
            // For timed events, use ISO string format
            startDate = new Date(start).toISOString();
            endDate = new Date(end).toISOString();
        }
        
        const eventData = {
            title,
            description,
            start: startDate,
            end: endDate,
            location,
            allDay,
            recurring,
            recurringType,
            recurringEnd
        };
        
        const createdEvent = await googleCalendarService.createEvent(eventData);
        res.json({ success: true, event: createdEvent });
        
    } catch (error) {
        console.error('Error creating Google Calendar event:', error);
        res.status(500).json({ error: error.message || 'Failed to create calendar event' });
    }
});

// Update event route
app.put('/calendar/update-event/:eventId', requireAuth, async (req, res) => {
    try {
        const { eventId } = req.params;
        const { title, description, start, end, location, allDay, recurringEditScope } = req.body;
        
        // Get user's Google Calendar tokens
        const integration = await db.collection('google_calendar_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = integration;
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : moment().add(1, 'hour').toDate();
                await db.collection('google_calendar_integration').updateOne(
                    { user_email: req.session.user.email },
                    { 
                        $set: { 
                            access_token: refreshedTokens.access_token, 
                            expires_at: newExpiresAt 
                        } 
                    }
                );
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Google Calendar token' });
            }
        }
        
        // Set credentials and update event
        googleCalendarService.setCredentials({ access_token, refresh_token });
        
        let startDate, endDate;
        if (allDay) {
            // For all-day events, use date format without time
            startDate = start;
            endDate = end;
        } else {
            // For timed events, use ISO string format
            startDate = new Date(start).toISOString();
            endDate = new Date(end).toISOString();
        }
        
        const eventData = {
            title,
            description,
            start: startDate,
            end: endDate,
            location,
            allDay,
            recurringEditScope
        };
        
        const updatedEvent = await googleCalendarService.updateEvent(eventId, eventData);
        res.json({ success: true, event: updatedEvent });
        
    } catch (error) {
        console.error('Error updating Google Calendar event:', error);
        res.status(500).json({ error: error.message || 'Failed to update calendar event' });
    }
});

// Delete event route
app.delete('/calendar/delete-event/:eventId', requireAuth, async (req, res) => {
    try {
        const { eventId } = req.params;
        const { recurringEditScope } = req.body;
        
        // Get user's Google Calendar tokens
        const integration = await db.collection('google_calendar_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = integration;
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : moment().add(1, 'hour').toDate();
                await db.collection('google_calendar_integration').updateOne(
                    { user_email: req.session.user.email },
                    { 
                        $set: { 
                            access_token: refreshedTokens.access_token, 
                            expires_at: newExpiresAt 
                        } 
                    }
                );
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Google Calendar token' });
            }
        }
        
        // Set credentials and delete event
        googleCalendarService.setCredentials({ access_token, refresh_token });
        
        await googleCalendarService.deleteEvent(eventId, recurringEditScope);
        res.json({ success: true, message: 'Event deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting Google Calendar event:', error);
        res.status(500).json({ error: error.message || 'Failed to delete calendar event' });
    }
});

// Dashboard route
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        // Get complete user data from database
        const user = await db.collection('users').findOne({
            username: req.session.user.email
        });
        
        let userData = req.session.user;
        if (user) {
            userData = {
                name: user.name,
                email: user.username,
                phone: user.phone || '',
                bio: user.bio || '',
                jobTitle: user.job_title || '',
                company: user.company || '',
                skills: user.skills || '',
                avatar_url: user.avatar_url || null
            };
        }
        
        res.render('index.ejs', {
            page: 'dashboard',
            user: userData
        });
        console.log('Dashboard accessed by:', req.session.user);
    } catch (error) {
        console.error('Error fetching user data for dashboard:', error);
        res.render('index.ejs', {
            page: 'dashboard',
            user: req.session.user
        });
    }
});

// Profile route
app.get('/profile', requireAuth, async (req, res) => {
    try {
        // Get complete user data from database
        const user = await db.collection('users').findOne({
            username: req.session.user.email
        });
        
        if (user) {
            res.render('index.ejs', {
                page: 'profile',
                user: {
                    name: user.name,
                    email: user.username,
                    phone: user.phone || '',
                    bio: user.bio || '',
                    jobTitle: user.job_title || '',
                    company: user.company || '',
                    skills: user.skills || '',
                    avatar_url: user.avatar_url || null
                }
            });
        } else {
            // Fallback to session data if user not found in DB
            res.render('index.ejs', {
                page: 'profile',
                user: {
                    ...req.session.user,
                    phone: '',
                    bio: '',
                    jobTitle: '',
                    company: '',
                    skills: '',
                    avatar_url: null
                }
            });
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        // Fallback to session data
        res.render('index.ejs', {
            page: 'profile',
            user: {
                ...req.session.user,
                phone: '',
                bio: '',
                jobTitle: '',
                company: '',
                skills: '',
                avatar_url: null
            }
        });
    }
    console.log('Profile accessed by:', req.session.user);
});

// Helper function for getting user data
async function getUserData(userEmail) {
    try {
        const user = await db.collection('users').findOne({
            username: userEmail
        });
        
        if (user) {
            return {
                name: user.name,
                email: user.username,
                phone: user.phone || '',
                bio: user.bio || '',
                jobTitle: user.job_title || '',
                company: user.company || '',
                skills: user.skills || '',
                avatar_url: user.avatar_url || null
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching user data:', error);
        return null;
    }
}

app.get('/calendar', requireAuth, async (req, res) => {
    try {
        const userData = await getUserData(req.session.user.email) || req.session.user;
        res.render('index.ejs', {
            page: 'calendar',
            user: userData
        });
    } catch (error) {
        console.error('Error fetching user data for calendar:', error);
        res.render('index.ejs', {
            page: 'calendar',
            user: req.session.user
        });
    }
});

app.get('/tasks', requireAuth, async (req, res) => {
    try {
        const userData = await getUserData(req.session.user.email) || req.session.user;
        res.render('index.ejs', {
            page: 'tasks',
            user: userData
        });
    } catch (error) {
        console.error('Error fetching user data for tasks:', error);
        res.render('index.ejs', {
            page: 'tasks',
            user: req.session.user
        });
    }
});

app.get('/email', requireAuth, async (req, res) => {
    try {
        const userData = await getUserData(req.session.user.email) || req.session.user;
        res.render('index.ejs', {
            page: 'email',
            user: userData
        });
    } catch (error) {
        console.error('Error fetching user data for email:', error);
        res.render('index.ejs', {
            page: 'email',
            user: req.session.user
        });
    }
});

// Gmail OAuth Routes
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
        const expiresAt = tokens.expiry_date ? 
            new Date(tokens.expiry_date) : 
            moment().add(1, 'hour').toDate();
        
        await db.collection('gmail_integration').replaceOne(
            { user_email: req.session.user.email },
            {
                user_email: req.session.user.email,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: expiresAt,
                gmail_email: gmailEmail,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            },
            { upsert: true }
        );

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
        await db.collection('gmail_integration').updateOne(
            { user_email: req.session.user.email },
            { $set: { is_active: false } }
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

// Gmail API Routes
// Get Gmail integration status
app.get('/api/gmail/status', requireAuth, async (req, res) => {
    try {
        const integration = await db.collection('gmail_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        const isConnected = !!integration;
        res.json({ 
            connected: isConnected,
            connectedSince: isConnected ? integration.created_at : null,
            gmailEmail: isConnected ? integration.gmail_email : null
        });
    } catch (error) {
        console.error('Error checking Gmail status:', error);
        res.status(500).json({ 
            connected: false,
            error: 'Failed to check status' 
        });
    }
});

// Helper function to process email attachments
async function processEmailAttachments(attachments, emailId, gmailMessageId, gmailService) {
    console.log(`Processing ${attachments.length} attachments for email ${emailId}`);
    
    for (const attachment of attachments) {
        try {
            // Skip if no attachment ID (shouldn't happen, but safety check)
            if (!attachment.attachmentId) {
                console.log(`Skipping attachment ${attachment.filename} - no attachment ID`);
                continue;
            }
            
            // Check if it's an image
            const isImage = gmailService.isImageMimeType(attachment.mimeType);
            
            // For small images (under 1MB), download and store directly
            let attachmentData = null;
            
            if (isImage && attachment.size < 1024 * 1024) { // 1MB limit
                try {
                    const downloadedAttachment = await gmailService.getAttachment(gmailMessageId, attachment.attachmentId);
                    attachmentData = Buffer.from(downloadedAttachment.data, 'base64');
                } catch (downloadError) {
                    console.error(`Error downloading attachment ${attachment.filename}:`, downloadError);
                    // Continue without the attachment data
                }
            }
            
            // Check if attachment already exists to prevent duplicates
            const existingAttachment = await db.collection('email_attachments').findOne({
                email_id: emailId,
                gmail_attachment_id: attachment.attachmentId
            });
            
            if (existingAttachment) {
                console.log(`Attachment ${attachment.filename} already exists for email ${emailId}, skipping`);
                continue;
            }
            
            // Insert attachment record
            await db.collection('email_attachments').insertOne({
                email_id: emailId,
                filename: attachment.filename,
                original_filename: attachment.filename,
                mime_type: attachment.mimeType,
                size_bytes: attachment.size,
                attachment_data: attachmentData,
                gmail_attachment_id: attachment.attachmentId,
                is_inline: attachment.isInline || false,
                content_id: attachment.contentId || null,
                created_at: new Date()
            });
            
        } catch (attachmentError) {
            console.error(`Error processing attachment ${attachment.filename}:`, attachmentError);
            // Continue with other attachments
        }
    }
}

// Sync emails from Gmail
app.post('/api/gmail/sync', requireAuth, async (req, res) => {
    try {
        const { maxResults = 50, query = '' } = req.body;
        
        // Get user's Gmail tokens
        const integration = await db.collection('gmail_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Gmail integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = integration;
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await gmailService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : moment().add(1, 'hour').toDate();
                await db.collection('gmail_integration').updateOne(
                    { user_email: req.session.user.email },
                    { 
                        $set: { 
                            access_token: refreshedTokens.access_token, 
                            expires_at: newExpiresAt 
                        } 
                    }
                );
            } catch (refreshError) {
                console.error('Error refreshing Gmail token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Gmail token' });
            }
        }
        
        // Set credentials and get messages
        gmailService.setCredentials({ access_token, refresh_token });
        const messages = await gmailService.getMessages(query, maxResults);
        
        // Store messages in database
        const syncedEmails = [];
        for (const message of messages) {
            try {
                // Check if email already exists
                const existingEmail = await db.collection('emails').findOne({
                    gmail_message_id: message.id,
                    user_email: req.session.user.email
                });
                
                if (!existingEmail) {
                    // Insert new email
                    const emailDoc = {
                        user_email: req.session.user.email,
                        sender_email: message.from,
                        recipient_email: message.to,
                        cc_emails: message.cc || null,
                        bcc_emails: message.bcc || null,
                        subject: message.subject,
                        body: message.body,
                        is_read: message.isRead,
                        is_important: message.isImportant,
                        email_type: 'received',
                        gmail_message_id: message.id,
                        gmail_thread_id: message.threadId,
                        gmail_labels: message.labels,
                        snippet: message.snippet,
                        synced_from_gmail: true,
                        received_at: message.date,
                        created_at: new Date(),
                        updated_at: new Date()
                    };
                    
                    const result = await db.collection('emails').insertOne(emailDoc);
                    const newEmail = { ...emailDoc, _id: result.insertedId };
                    syncedEmails.push(newEmail);
                    
                    // Process attachments if they exist
                    if (message.attachments && message.attachments.length > 0) {
                        await processEmailAttachments(message.attachments, result.insertedId, message.id, gmailService);
                    }
                } else {
                    // Update existing email
                    const updatedEmail = await db.collection('emails').findOneAndUpdate(
                        { gmail_message_id: message.id, user_email: req.session.user.email },
                        {
                            $set: {
                                is_read: message.isRead,
                                is_important: message.isImportant,
                                gmail_labels: message.labels,
                                snippet: message.snippet,
                                updated_at: new Date()
                            }
                        },
                        { returnDocument: 'after' }
                    );
                    
                    if (updatedEmail.value) {
                        syncedEmails.push(updatedEmail.value);
                        
                        // Check if we need to process attachments for this existing email
                        if (message.attachments && message.attachments.length > 0) {
                            const existingAttachments = await db.collection('email_attachments').find({
                                email_id: updatedEmail.value._id
                            }).toArray();
                            const existingAttachmentIds = existingAttachments.map(a => a.gmail_attachment_id);
                            const newAttachments = message.attachments.filter(a => !existingAttachmentIds.includes(a.attachmentId));
                            
                            if (newAttachments.length > 0) {
                                await processEmailAttachments(newAttachments, updatedEmail.value._id, message.id, gmailService);
                            }
                        }
                    }
                }
            } catch (emailError) {
                console.error(`Error processing email ${message.id}:`, emailError);
                // Continue with other emails
            }
        }
        
        res.json({
            success: true,
            syncedCount: syncedEmails.length,
            totalFetched: messages.length,
            emails: syncedEmails
        });
        
    } catch (error) {
        console.error('Error syncing Gmail messages:', error);
        res.status(500).json({ error: 'Failed to sync Gmail messages' });
    }
});

// ... [Continue with more routes in the next part due to size limits]
