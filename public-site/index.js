import ejs from 'ejs';
import express from 'express';
import pg from 'pg';
import bodyParser from 'body-parser';
import moment from 'moment';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import dotenv from 'dotenv';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostgreSQL session store
const PgSession = pgSession(session);

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Create a separate pool for session store
const sessionPool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  store: new PgSession({
    pool: sessionPool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport Local Strategy
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const query = 'SELECT * FROM users WHERE username = $1 AND password = $2';
    const result = await db.query(query, [email, hash]);
    
    if (result.rows.length > 0) {
      const user = {
        id: result.rows[0].id,
        email: result.rows[0].username,
        name: result.rows[0].name
      };
      return done(null, user);
    } else {
      return done(null, false, { message: 'Invalid email or password' });
    }
  } catch (error) {
    return done(error);
  }
}));

// Passport Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists with Google email
    const checkQuery = 'SELECT * FROM users WHERE username = $1';
    const checkResult = await db.query(checkQuery, [profile.emails[0].value]);
    
    let user;
    if (checkResult.rows.length > 0) {
      // User exists, return user
      user = {
        id: checkResult.rows[0].id,
        email: checkResult.rows[0].username,
        name: checkResult.rows[0].name
      };
    } else {
      // Create new user
      const insertQuery = 'INSERT INTO users (name, username, password, entrydate, lastlogin) VALUES ($1, $2, $3, $4, $5) RETURNING *';
      const values = [
        profile.displayName,
        profile.emails[0].value,
        'google_oauth', // placeholder password for OAuth users
        moment().format('YYYY-MM-DD HH:mm:ss'),
        moment().format('YYYY-MM-DD HH:mm:ss')
      ];
      
      const insertResult = await db.query(insertQuery, values);
      user = {
        id: insertResult.rows[0].id,
        email: insertResult.rows[0].username,
        name: insertResult.rows[0].name
      };
    }
    
    // Store Google Calendar tokens if available
    if (accessToken && profile.emails && profile.emails[0]) {
      try {
        // Store calendar integration tokens
        const calendarIntegrationQuery = `
          INSERT INTO google_calendar_integration (user_email, access_token, refresh_token, expires_at, scope, calendar_info)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (user_email) 
          DO UPDATE SET 
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            scope = EXCLUDED.scope,
            calendar_info = EXCLUDED.calendar_info,
            updated_at = CURRENT_TIMESTAMP,
            is_active = true
        `;
        
        // Calculate expiry date (Google tokens typically expire in 1 hour)
        const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour from now
        
        const calendarInfo = {
          id: profile.emails[0].value,
          summary: `${profile.displayName}'s Calendar`,
          timeZone: 'America/New_York'
        };
        
        await db.query(calendarIntegrationQuery, [
          profile.emails[0].value,
          accessToken,
          refreshToken || null,
          expiresAt,
          'https://www.googleapis.com/auth/calendar.readonly',
          JSON.stringify(calendarInfo)
        ]);
        
        console.log('✅ Google Calendar integration stored for user:', profile.emails[0].value);
      } catch (calendarError) {
        console.error('⚠️ Error storing calendar integration:', calendarError);
        // Don't fail the login if calendar storage fails
      }
    }
    
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await db.query(query, [id]);
    
    if (result.rows.length > 0) {
      const user = {
        id: result.rows[0].id,
        email: result.rows[0].username,
        name: result.rows[0].name
      };
      done(null, user);
    } else {
      done(null, false);
    }
  } catch (error) {
    done(error);
  }
});

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Google OAuth routes
app.get('/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'] 
  })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    // Update lastlogin for Google OAuth users
    try {
      const updateQuery = 'UPDATE users SET lastlogin = $1 WHERE username = $2';
      await db.query(updateQuery, [moment().format('YYYY-MM-DD HH:mm:ss'), req.user.email]);
    } catch (error) {
      console.error('Error updating lastlogin for Google user:', error);
    }
    
    // Set session user
    req.session.user = {
      email: req.user.email,
      name: req.user.name
    };
    
    // Redirect to private zone
    const privateZoneUrl = process.env.PRIVATE_ZONE_URL || 'http://localhost:3001/dashboard';
    res.redirect(privateZoneUrl);
  }
);

// Logout route
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Error during logout:', err);
    }
    req.session.destroy(err => {
      if (err) {
        console.error('Error destroying session:', err);
      }
      res.redirect('/');
    });
  });
});

// Public routes
app.get('/', (req, res) => {
    res.render('index.ejs', {
        page: 'homepage'
    });
});

app.get('/pricing', (req, res) => {
    res.render('index.ejs', {
        page: 'pricing'
    });
});

app.get('/about', (req, res) => {
    res.render('index.ejs', {
        page: 'about'
    });
});

app.get('/contact', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.render('index.ejs', {
        page: 'contact',
        message: undefined,
        method: 'GET'
    });
});

app.get("/login", (req, res) => {
    res.render("index.ejs", {
        page: "login",
        message: undefined,
        method: 'GET'
    });
});

app.get('/signup', (req, res) => {
    res.render('index.ejs', {
        page: 'SignUp',
        message: undefined,
        method: 'GET'
    });
});

// Registration endpoint
app.post('/register', async (req, res) => {
    console.log('Received a request to register a user');
    const { name, email, password } = req.body;

    try {
        // First check if email already exists
        const checkQuery = 'SELECT username FROM users WHERE username = $1';
        const checkResult = await db.query(checkQuery, [email]);
        
        if (checkResult.rows.length > 0) {
            // Email already exists
            const sweetalertScript = `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script><script>Swal.fire({icon: 'error', title: 'Email Already Registered', text: 'This email address is already registered. Please use a different email or try logging in.', confirmButtonColor: '#3085d6', theme: 'auto'});</script>`;
            return res.render('index.ejs', {
                page: 'SignUp',
                sweetalertScript,
                message: undefined,
                method: 'POST'
            });
        }

        // Hash the password using SHA256
        const hash = crypto.createHash('sha256').update(password).digest('hex');

        const query = 'INSERT INTO users (name, username, password, entrydate, lastlogin) VALUES ($1, $2, $3, $4, $5)';
        const values = [name, email, hash, moment().format('YYYY-MM-DD HH:mm:ss'), moment().format('YYYY-MM-DD HH:mm:ss')];
        
        await db.query(query, values);
        console.log('User registered successfully');
        res.render('index.ejs', {
            page: 'login',
            message: 'Registration successful! Please log in.',
            sweetalertScript: undefined,
            method: 'POST'
        });
    } catch (error) {
        console.error('Error registering user:', error);
        const sweetalertScript = `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script><script>Swal.fire({icon: 'error', title: 'Registration Error', text: 'There was an error registering your account. Please try again later.', confirmButtonColor: '#3085d6', theme: 'auto'});</script>`;
        res.render('index.ejs', {
            page: 'SignUp',
            sweetalertScript,
            message: undefined,
            method: 'POST'
        });
    }
});

// Login endpoint - using Passport local strategy
app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error('Error during login:', err);
      const sweetalertScript = `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script><script>Swal.fire({icon: 'error', title: 'There was an error logging in. Please try again later.', confirmButtonColor: '#3085d6', theme: 'auto'});</script>`;
      return res.render('index.ejs', {
        page: 'login',
        sweetalertScript,
        method: 'POST'
      });
    }
    
    if (!user) {
      // Login failed
      const sweetalertScript = `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script><script>Swal.fire({icon: 'error', title: 'Invalid email or password. Please try again.', confirmButtonColor: '#3085d6', theme: 'auto'});</script>`;
      return res.render('index.ejs', {
        page: 'login',
        sweetalertScript,
        method: 'POST'
      });
    }
    
    req.logIn(user, async (err) => {
      if (err) {
        console.error('Error during login session creation:', err);
        const sweetalertScript = `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script><script>Swal.fire({icon: 'error', title: 'There was an error logging in. Please try again later.', confirmButtonColor: '#3085d6', theme: 'auto'});</script>`;
        return res.render('index.ejs', {
          page: 'login',
          sweetalertScript,
          method: 'POST'
        });
      }
      
      // Update lastlogin
      try {
        const updateQuery = 'UPDATE users SET lastlogin = $1 WHERE username = $2';
        await db.query(updateQuery, [moment().format('YYYY-MM-DD HH:mm:ss'), user.email]);
      } catch (error) {
        console.error('Error updating lastlogin:', error);
      }
      
      // Set session user
      req.session.user = {
        email: user.email,
        name: user.name
      };
      
      console.log('User logged in:', req.session.user);
      
      // Redirect to private zone app
      const privateZoneUrl = process.env.PRIVATE_ZONE_URL || 'http://localhost:3001/dashboard';
      return res.redirect(privateZoneUrl);
    });
  })(req, res, next);
});

// Database connection and server startup
async function startServer() {
  try {
    await db.connect();
    console.log('Connected to the database successfully');
    app.listen(port, () => {
      console.log(`Public Site is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Error connecting to the database:', error);
    process.exit(1);
  }
}

startServer();
