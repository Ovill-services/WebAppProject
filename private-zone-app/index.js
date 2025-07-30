import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import bodyParser from 'body-parser';
import pg from 'pg';
import pgSession from 'connect-pg-simple';
import multer from 'multer';
import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { GoogleCalendarService } from './services/googleCalendarService.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Google Calendar Service
const googleCalendarService = new GoogleCalendarService();

// PostgreSQL session store
const PgSession = pgSession(session);

// Database connection
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "Ovill",
  password: "mysecretpassword",
  port: 5433,
});

// Create a pool for session store
const sessionPool = new pg.Pool({
  user: "postgres",
  host: "localhost",
  database: "Ovill",
  password: "mysecretpassword",
  port: 5433,
});

const app = express();
const port = 3001;

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  store: new PgSession({
    pool: sessionPool,
    tableName: 'session'
  }),
  secret: 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
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

// Middleware to check authentication
function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        // Redirect to public site login
        res.redirect('http://localhost:3000/login');
    }
}

// API Routes for Google Calendar (status and events only)

// Get Google Calendar integration status
app.get('/api/google/calendar/status', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT is_active, created_at, calendar_info FROM google_calendar_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        const isConnected = result.rows.length > 0;
        res.json({ 
            connected: isConnected,
            connectedSince: isConnected ? result.rows[0].created_at : null,
            calendarInfo: isConnected ? result.rows[0].calendar_info : null
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
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token, expires_at FROM google_calendar_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = tokenResult.rows[0];
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : null;
                await db.query(
                    'UPDATE google_calendar_integration SET access_token = $1, expires_at = $2 WHERE user_email = $3',
                    [refreshedTokens.access_token, newExpiresAt, req.session.user.email]
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
        res.json({ success: true, events });
        
    } catch (error) {
        console.error('Error fetching Google Calendar events:', error);
        res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
});

// Create event in Google Calendar
app.post('/api/google/calendar/events', requireAuth, async (req, res) => {
    try {
        const { title, description, start, end, location, attendees } = req.body;
        
        // Get user's Google Calendar tokens
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token FROM google_calendar_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        const { access_token, refresh_token } = tokenResult.rows[0];
        
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
        const { title, description, start, end, location, allDay } = req.body;
        
        // Get user's Google Calendar tokens
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token, expires_at FROM google_calendar_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = tokenResult.rows[0];
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : null;
                await db.query(
                    'UPDATE google_calendar_integration SET access_token = $1, expires_at = $2 WHERE user_email = $3',
                    [refreshedTokens.access_token, newExpiresAt, req.session.user.email]
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
            allDay
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
        const { title, description, start, end, location, allDay } = req.body;
        
        // Get user's Google Calendar tokens
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token, expires_at FROM google_calendar_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = tokenResult.rows[0];
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : null;
                await db.query(
                    'UPDATE google_calendar_integration SET access_token = $1, expires_at = $2 WHERE user_email = $3',
                    [refreshedTokens.access_token, newExpiresAt, req.session.user.email]
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
            allDay
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
        
        // Get user's Google Calendar tokens
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token, expires_at FROM google_calendar_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Google Calendar integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = tokenResult.rows[0];
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await googleCalendarService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : null;
                await db.query(
                    'UPDATE google_calendar_integration SET access_token = $1, expires_at = $2 WHERE user_email = $3',
                    [refreshedTokens.access_token, newExpiresAt, req.session.user.email]
                );
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Google Calendar token' });
            }
        }
        
        // Set credentials and delete event
        googleCalendarService.setCredentials({ access_token, refresh_token });
        
        await googleCalendarService.deleteEvent(eventId);
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
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await db.query(query, [req.session.user.email]);
        
        let userData = req.session.user;
        if (result.rows.length > 0) {
            const dbUser = result.rows[0];
            userData = {
                name: dbUser.name,
                email: dbUser.username,
                phone: dbUser.phone || '',
                bio: dbUser.bio || '',
                jobTitle: dbUser.job_title || '',
                company: dbUser.company || '',
                skills: dbUser.skills || '',
                avatar_url: dbUser.avatar_url || null
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
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await db.query(query, [req.session.user.email]);
        
        if (result.rows.length > 0) {
            const userData = result.rows[0];
            res.render('index.ejs', {
                page: 'profile',
                user: {
                    name: userData.name,
                    email: userData.username,
                    phone: userData.phone || '',
                    bio: userData.bio || '',
                    jobTitle: userData.job_title || '',
                    company: userData.company || '',
                    skills: userData.skills || '',
                    avatar_url: userData.avatar_url || null
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

app.get('/calendar', requireAuth, async (req, res) => {
    try {
        // Get complete user data from database
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await db.query(query, [req.session.user.email]);
        
        let userData = req.session.user;
        if (result.rows.length > 0) {
            const dbUser = result.rows[0];
            userData = {
                name: dbUser.name,
                email: dbUser.username,
                phone: dbUser.phone || '',
                bio: dbUser.bio || '',
                jobTitle: dbUser.job_title || '',
                company: dbUser.company || '',
                skills: dbUser.skills || '',
                avatar_url: dbUser.avatar_url || null
            };
        }
        
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
        // Get complete user data from database
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await db.query(query, [req.session.user.email]);
        
        let userData = req.session.user;
        if (result.rows.length > 0) {
            const dbUser = result.rows[0];
            userData = {
                name: dbUser.name,
                email: dbUser.username,
                phone: dbUser.phone || '',
                bio: dbUser.bio || '',
                jobTitle: dbUser.job_title || '',
                company: dbUser.company || '',
                skills: dbUser.skills || '',
                avatar_url: dbUser.avatar_url || null
            };
        }
        
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
        // Get complete user data from database
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await db.query(query, [req.session.user.email]);
        
        let userData = req.session.user;
        if (result.rows.length > 0) {
            const dbUser = result.rows[0];
            userData = {
                name: dbUser.name,
                email: dbUser.username,
                phone: dbUser.phone || '',
                bio: dbUser.bio || '',
                jobTitle: dbUser.job_title || '',
                company: dbUser.company || '',
                skills: dbUser.skills || '',
                avatar_url: dbUser.avatar_url || null
            };
        }
        
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

app.get('/email', requireAuth, async (req, res) => {
    try {
        // Get complete user data from database
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await db.query(query, [req.session.user.email]);
        
        let userData = req.session.user;
        if (result.rows.length > 0) {
            const dbUser = result.rows[0];
            userData = {
                name: dbUser.name,
                email: dbUser.username,
                phone: dbUser.phone || '',
                bio: dbUser.bio || '',
                jobTitle: dbUser.job_title || '',
                company: dbUser.company || '',
                skills: dbUser.skills || '',
                avatar_url: dbUser.avatar_url || null
            };
        }
        
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


// Email API Routes
// Get all emails for the authenticated user
app.get('/api/emails', requireAuth, async (req, res) => {
    try {
        const { filter, search } = req.query;
        let query = 'SELECT * FROM emails WHERE user_email = $1';
        let params = [req.session.user.email];
        
        // Apply filters
        if (filter === 'unread') {
            query += ' AND is_read = FALSE';
        } else if (filter === 'read') {
            query += ' AND is_read = TRUE';
        } else if (filter === 'important') {
            query += ' AND is_important = TRUE';
        }
        
        // Apply search
        if (search) {
            query += ' AND (subject ILIKE $' + (params.length + 1) + ' OR sender_email ILIKE $' + (params.length + 1) + ' OR body ILIKE $' + (params.length + 1) + ')';
            params.push(`%${search}%`);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const result = await db.query(query, params);
        res.json({
            success: true,
            emails: result.rows
        });
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching emails'
        });
    }
});

// Send/Save email
app.post('/api/emails', requireAuth, async (req, res) => {
    try {
        const { to, cc, bcc, subject, body, isImportant, isDraft } = req.body;
        
        if (!to || !subject || !body) {
            return res.status(400).json({
                success: false,
                message: 'To, subject, and body are required'
            });
        }
        
        const query = `
            INSERT INTO emails (user_email, sender_email, recipient_email, cc_emails, bcc_emails, subject, body, is_important, is_draft, email_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `;
        
        const values = [
            req.session.user.email, // user_email (owner)
            req.session.user.email, // sender_email
            to, // recipient_email
            cc || null, // cc_emails
            bcc || null, // bcc_emails
            subject,
            body,
            isImportant || false,
            isDraft || false,
            isDraft ? 'draft' : 'sent'
        ];
        
        const result = await db.query(query, values);
        
        res.json({
            success: true,
            message: isDraft ? 'Draft saved successfully' : 'Email sent successfully',
            email: result.rows[0]
        });
    } catch (error) {
        console.error('Error sending/saving email:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending email'
        });
    }
});

// Mark email as read/unread
app.put('/api/emails/:id/read', requireAuth, async (req, res) => {
    try {
        const emailId = parseInt(req.params.id);
        const { isRead } = req.body;
        
        const query = 'UPDATE emails SET is_read = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_email = $3 RETURNING *';
        const result = await db.query(query, [isRead, emailId, req.session.user.email]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        
        res.json({
            success: true,
            email: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating email read status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating email'
        });
    }
});

// Mark email as important/unimportant
app.put('/api/emails/:id/important', requireAuth, async (req, res) => {
    try {
        const emailId = parseInt(req.params.id);
        const { isImportant } = req.body;
        
        const query = 'UPDATE emails SET is_important = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_email = $3 RETURNING *';
        const result = await db.query(query, [isImportant, emailId, req.session.user.email]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        
        res.json({
            success: true,
            email: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating email importance:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating email'
        });
    }
});

// Delete email
app.delete('/api/emails/:id', requireAuth, async (req, res) => {
    try {
        const emailId = parseInt(req.params.id);
        
        const query = 'DELETE FROM emails WHERE id = $1 AND user_email = $2 RETURNING *';
        const result = await db.query(query, [emailId, req.session.user.email]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Email deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting email:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting email'
        });
    }
});

// Get single email
app.get('/api/emails/:id', requireAuth, async (req, res) => {
    try {
        const emailId = parseInt(req.params.id);
        
        const query = 'SELECT * FROM emails WHERE id = $1 AND user_email = $2';
        const result = await db.query(query, [emailId, req.session.user.email]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        
        res.json({
            success: true,
            email: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching email:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching email'
        });
    }
});

// Profile update route
app.put('/api/profile', requireAuth, async (req, res) => {
    try {
        const { name, email, phone, bio, jobTitle, company, skills } = req.body;
        
        // Update user in database
        const query = `
            UPDATE users 
            SET name = $1, username = $2, phone = $3, bio = $4, job_title = $5, company = $6, skills = $7
            WHERE username = $8
            RETURNING avatar_url
        `;
        const values = [name, email, phone, bio, jobTitle, company, skills, req.session.user.email];
        
        const result = await db.query(query, values);
        
        // Update session data
        req.session.user = {
            name: name,
            email: email
        };
        
        res.json({ 
            success: true, 
            message: 'Profile updated successfully',
            avatar_url: result.rows[0]?.avatar_url
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating profile' 
        });
    }
});

// Avatar upload route
app.post('/api/upload-avatar', requireAuth, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No file uploaded' 
            });
        }

        // Generate the URL path for the uploaded file
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        
        // Update user's avatar_url in database
        const query = `
            UPDATE users 
            SET avatar_url = $1 
            WHERE username = $2
            RETURNING avatar_url
        `;
        const values = [avatarUrl, req.session.user.email];
        
        const result = await db.query(query, values);
        
        res.json({ 
            success: true, 
            message: 'Avatar uploaded successfully',
            avatar_url: result.rows[0]?.avatar_url
        });
    } catch (error) {
        console.error('Error uploading avatar:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error uploading avatar' 
        });
    }
});

// Translations API route
app.get('/api/translations/:lang', (req, res) => {
    try {
        const requestedLang = req.params.lang || 'en';
        const supportedLanguages = ['en', 'es', 'fr', 'de'];
        
        // Default to English if language not supported
        const lang = supportedLanguages.includes(requestedLang) ? requestedLang : 'en';
        
        // Read translation file
        const translationPath = path.join(__dirname, 'translations', `${lang}.json`);
        
        if (fs.existsSync(translationPath)) {
            const translations = JSON.parse(fs.readFileSync(translationPath, 'utf8'));
            
            // Flatten the nested object for easier frontend access
            const flatTranslations = {};
            
            function flatten(obj, prefix = '') {
                for (const key in obj) {
                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                        flatten(obj[key], prefix + key + '.');
                    } else {
                        flatTranslations[prefix + key] = obj[key];
                    }
                }
            }
            
            flatten(translations);
            
            res.json({
                success: true,
                language: lang,
                translations: flatTranslations
            });
        } else {
            // Fallback to English if file doesn't exist
            const fallbackPath = path.join(__dirname, 'translations', 'en.json');
            const translations = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
            
            const flatTranslations = {};
            function flatten(obj, prefix = '') {
                for (const key in obj) {
                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                        flatten(obj[key], prefix + key + '.');
                    } else {
                        flatTranslations[prefix + key] = obj[key];
                    }
                }
            }
            
            flatten(translations);
            
            res.json({
                success: true,
                language: 'en',
                translations: flatTranslations
            });
        }
    } catch (error) {
        console.error('Error loading translations:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading translations'
        });
    }
});

// Default translations route (defaults to English)
app.get('/api/translations', (req, res) => {
    res.redirect('/api/translations/en');
});

// Task Management API Routes

// Get all tasks for the authenticated user
app.get('/api/tasks', requireAuth, async (req, res) => {
    try {
        const query = 'SELECT * FROM tasks WHERE user_email = $1 ORDER BY created_at DESC';
        const result = await db.query(query, [req.session.user.email]);
        
        res.json({
            success: true,
            tasks: result.rows
        });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching tasks'
        });
    }
});

// Create a new task
app.post('/api/tasks', requireAuth, async (req, res) => {
    try {
        const { text, source = 'user' } = req.body;
        
        if (!text || text.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Task text is required'
            });
        }

        // Validate source
        const validSources = ['user', 'google_tasks', 'microsoft_todo', 'calendar_integration'];
        const taskSource = validSources.includes(source) ? source : 'user';
        
        const query = `
            INSERT INTO tasks (user_email, text, completed, source)
            VALUES ($1, $2, false, $3)
            RETURNING *
        `;
        const values = [req.session.user.email, text.trim(), taskSource];
        const result = await db.query(query, values);
        
        res.json({
            success: true,
            task: result.rows[0],
            message: 'Task created successfully'
        });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating task'
        });
    }
});

// Update a task (text or completion status)
app.put('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        const { text, completed, source } = req.body;
        
        // First check if the task belongs to the user
        const checkQuery = 'SELECT * FROM tasks WHERE id = $1 AND user_email = $2';
        const checkResult = await db.query(checkQuery, [taskId, req.session.user.email]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Validate source if provided
        const validSources = ['user', 'google_tasks', 'microsoft_todo', 'calendar_integration'];
        const validatedSource = source && validSources.includes(source) ? source : undefined;
        
        // Build dynamic update query based on provided fields
        const updateFields = [];
        const values = [];
        let valueIndex = 1;
        
        if (text !== undefined) {
            updateFields.push(`text = $${valueIndex++}`);
            values.push(text.trim());
        }
        
        if (completed !== undefined) {
            updateFields.push(`completed = $${valueIndex++}`);
            values.push(completed);
        }
        
        if (validatedSource !== undefined) {
            updateFields.push(`source = $${valueIndex++}`);
            values.push(validatedSource);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid update data provided'
            });
        }
        
        // Add WHERE clause parameters
        values.push(taskId, req.session.user.email);
        
        const updateQuery = `
            UPDATE tasks 
            SET ${updateFields.join(', ')} 
            WHERE id = $${valueIndex++} AND user_email = $${valueIndex++} 
            RETURNING *
        `;
        
        const result = await db.query(updateQuery, values);
        
        res.json({
            success: true,
            task: result.rows[0],
            message: 'Task updated successfully'
        });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating task'
        });
    }
});

// Delete a task
app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        
        // First check if the task belongs to the user, then delete
        const query = 'DELETE FROM tasks WHERE id = $1 AND user_email = $2 RETURNING *';
        const result = await db.query(query, [taskId, req.session.user.email]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Task deleted successfully',
            deletedTask: result.rows[0]
        });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting task'
        });
    }
});

// Bulk operations for tasks
app.post('/api/tasks/bulk', requireAuth, async (req, res) => {
    try {
        const { action, taskIds } = req.body;
        
        if (!action || !taskIds || !Array.isArray(taskIds)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid bulk operation request'
            });
        }
        
        let query;
        let values;
        
        switch (action) {
            case 'complete':
                query = 'UPDATE tasks SET completed = true WHERE id = ANY($1) AND user_email = $2 RETURNING *';
                values = [taskIds, req.session.user.email];
                break;
            case 'uncomplete':
                query = 'UPDATE tasks SET completed = false WHERE id = ANY($1) AND user_email = $2 RETURNING *';
                values = [taskIds, req.session.user.email];
                break;
            case 'delete':
                query = 'DELETE FROM tasks WHERE id = ANY($1) AND user_email = $2 RETURNING *';
                values = [taskIds, req.session.user.email];
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid bulk action'
                });
        }
        
        const result = await db.query(query, values);
        
        res.json({
            success: true,
            affectedTasks: result.rows,
            message: `Bulk ${action} operation completed successfully`
        });
    } catch (error) {
        console.error('Error performing bulk operation:', error);
        res.status(500).json({
            success: false,
            message: 'Error performing bulk operation'
        });
    }
});

// Google Tasks integration (placeholder for future implementation)

// Get Google Tasks integration status
app.get('/api/google/tasks/status', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT is_active, created_at, task_info FROM google_tasks_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        const isConnected = result.rows.length > 0;
        res.json({ 
            connected: isConnected,
            connectedSince: isConnected ? result.rows[0].created_at : null,
            taskInfo: isConnected ? result.rows[0].task_info : null
        });
    } catch (error) {
        console.error('Error checking Google Tasks status:', error);
        res.status(500).json({ 
            connected: false,
            error: 'Failed to check status' 
        });
    }
});

// Sync tasks from Google Tasks
app.post('/api/google/tasks/sync', requireAuth, async (req, res) => {
    try {
        // Get user's Google Tasks tokens
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token, expires_at FROM google_tasks_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Google Tasks integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = tokenResult.rows[0];
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            // You'll need to implement token refresh for Google Tasks
            // Similar to your calendar refresh logic
        }
        
        // Fetch tasks from Google Tasks API
        const response = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Google Tasks API error: ${response.status}`);
        }
        
        const googleTasks = await response.json();
        
        // Store/update tasks in your database
        const syncedTasks = [];
        for (const googleTask of googleTasks.items || []) {
            // Check if task already exists
            const existingTask = await db.query(
                'SELECT id FROM tasks WHERE google_task_id = $1 AND user_email = $2',
                [googleTask.id, req.session.user.email]
            );
            
            if (existingTask.rows.length === 0) {
                // Insert new task
                const insertResult = await db.query(
                    'INSERT INTO tasks (user_email, text, completed, source, google_task_id, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                    [
                        req.session.user.email,
                        googleTask.title,
                        googleTask.status === 'completed',
                        'google_tasks',
                        googleTask.id,
                        new Date()
                    ]
                );
                syncedTasks.push(insertResult.rows[0]);
            } else {
                // Update existing task
                const updateResult = await db.query(
                    'UPDATE tasks SET text = $1, completed = $2, updated_at = $3 WHERE google_task_id = $4 AND user_email = $5 RETURNING *',
                    [
                        googleTask.title,
                        googleTask.status === 'completed',
                        new Date(),
                        googleTask.id,
                        req.session.user.email
                    ]
                );
                syncedTasks.push(updateResult.rows[0]);
            }
        }
        
        res.json({ 
            success: true, 
            syncedCount: syncedTasks.length,
            tasks: syncedTasks
        });
        
    } catch (error) {
        console.error('Error syncing Google Tasks:', error);
        res.status(500).json({ error: 'Failed to sync Google Tasks' });
    }
});

// Push task to Google Tasks
app.post('/api/google/tasks/push', requireAuth, async (req, res) => {
    try {
        const { taskId } = req.body;
        
        // Get the task
        const taskResult = await db.query(
            'SELECT * FROM tasks WHERE id = $1 AND user_email = $2',
            [taskId, req.session.user.email]
        );
        
        if (taskResult.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        const task = taskResult.rows[0];
        
        // Get user's Google Tasks tokens
        const tokenResult = await db.query(
            'SELECT access_token, refresh_token FROM google_tasks_integration WHERE user_email = $1 AND is_active = true',
            [req.session.user.email]
        );
        
        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Google Tasks integration not found' });
        }
        
        const { access_token } = tokenResult.rows[0];
        
        // Create task in Google Tasks
        const googleTaskData = {
            title: task.text,
            status: task.completed ? 'completed' : 'needsAction'
        };
        
        const response = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(googleTaskData)
        });
        
        if (!response.ok) {
            throw new Error(`Google Tasks API error: ${response.status}`);
        }
        
        const createdGoogleTask = await response.json();
        
        // Update local task with Google Task ID
        await db.query(
            'UPDATE tasks SET google_task_id = $1, source = $2 WHERE id = $3',
            [createdGoogleTask.id, 'google_tasks', taskId]
        );
        
        res.json({ 
            success: true, 
            googleTaskId: createdGoogleTask.id
        });
        
    } catch (error) {
        console.error('Error pushing task to Google Tasks:', error);
        res.status(500).json({ error: 'Failed to push task to Google Tasks' });
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        // Redirect to public site
        res.redirect('http://localhost:3000/');
    });
});

// Default redirect to dashboard
app.get('/', requireAuth, (req, res) => {
    res.redirect('/dashboard');
});

// Database connection and server startup
async function startServer() {
    try {
        await db.connect();
        console.log('Connected to the database successfully');
        
        app.listen(port, () => {
            console.log(`Private Zone App is running at http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Error connecting to the database:', error);
        process.exit(1);
    }
}

startServer();
//