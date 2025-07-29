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

app.get('/calendar', requireAuth, (req, res) => {
    res.render('index.ejs', {
        page: 'calendar',
        user: req.session.user
    });
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
