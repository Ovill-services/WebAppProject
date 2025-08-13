import ejs from 'ejs';
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import bodyParser from 'body-parser';
import moment from 'moment';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:secretpassword@mongodb:27017/private_zone?authSource=admin';
const client = new MongoClient(mongoUri);
let db;

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

// MongoDB session store
app.use(session({
  store: MongoStore.create({
    mongoUrl: mongoUri,
    collectionName: 'sessions'
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
    const user = await db.collection('users').findOne({
      username: email,
      password: hash
    });
    
    if (user) {
      const userObj = {
        id: user._id,
        email: user.username,
        name: user.name
      };
      return done(null, userObj);
    } else {
      return done(null, false, { message: 'Invalid email or password' });
    }
  } catch (error) {
    return done(error);
  }
}));

// Passport Google Strategy
const googleOAuthEnabled = process.env.GOOGLE_CLIENT_ID && 
                          process.env.GOOGLE_CLIENT_SECRET && 
                          process.env.GOOGLE_CLIENT_ID !== 'disabled' && 
                          process.env.GOOGLE_CLIENT_SECRET !== 'disabled';

if (googleOAuthEnabled) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists with Google email
      const existingUser = await db.collection('users').findOne({
        username: profile.emails[0].value
      });
      
      let user;
      if (existingUser) {
        // User exists, return user
        user = {
          id: existingUser._id,
          email: existingUser.username,
          name: existingUser.name
        };
      } else {
        // Create new user
        const newUser = {
          name: profile.displayName,
          username: profile.emails[0].value,
          password: 'google_oauth', // placeholder password for OAuth users
          entrydate: new Date(),
          lastlogin: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          is_active: true,
          role: 'user'
        };
        
        const result = await db.collection('users').insertOne(newUser);
        user = {
          id: result.insertedId,
          email: newUser.username,
          name: newUser.name
        };
      }
      
      // Store Google Calendar tokens if available
      if (accessToken && profile.emails && profile.emails[0]) {
        try {
          // Google OAuth tokens typically expire in 1 hour
          const expiresAt = moment().add(1, 'hour').toDate();
          
          let calendarInfo = {};
          let taskInfo = {};
          
          // Store calendar integration tokens
          await db.collection('google_calendar_integration').replaceOne(
            { user_email: profile.emails[0].value },
            {
              user_email: profile.emails[0].value,
              access_token: accessToken,
              refresh_token: refreshToken || null,
              expires_at: expiresAt,
              scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
              calendar_info: calendarInfo,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date()
            },
            { upsert: true }
          );
          
          console.log('✅ Google Calendar integration stored for user:', profile.emails[0].value);
          
          // Store Google Tasks integration tokens
          await db.collection('google_tasks_integration').replaceOne(
            { user_email: profile.emails[0].value },
            {
              user_email: profile.emails[0].value,
              access_token: accessToken,
              refresh_token: refreshToken || null,
              expires_at: expiresAt,
              scope: 'https://www.googleapis.com/auth/tasks',
              task_info: taskInfo,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date()
            },
            { upsert: true }
          );
          
          console.log('✅ Google Tasks integration stored for user:', profile.emails[0].value);
          
          // Store Gmail integration tokens
          await db.collection('gmail_integration').replaceOne(
            { user_email: profile.emails[0].value },
            {
              user_email: profile.emails[0].value,
              access_token: accessToken,
              refresh_token: refreshToken || null,
              expires_at: expiresAt,
              gmail_email: profile.emails[0].value,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date()
            },
            { upsert: true }
          );
          
          console.log('✅ Gmail integration stored for user:', profile.emails[0].value);
          
        } catch (integrationError) {
          console.error('⚠️ Error storing Google integrations:', integrationError);
          // Don't fail the login if integration storage fails
        }
      }
      
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));

  console.log('Google OAuth enabled');
} else {
  console.log('Google OAuth disabled - no valid credentials provided');
}

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
    
    if (user) {
      const userObj = {
        id: user._id,
        email: user.username,
        name: user.name
      };
      done(null, userObj);
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

// Google OAuth routes (only if enabled)
if (googleOAuthEnabled) {
  app.get('/auth/google',
    passport.authenticate('google', { 
      scope: [
        'profile', 
        'email', 
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
      ] 
    })
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    async (req, res) => {
      // Update lastlogin for Google OAuth users
      try {
        await db.collection('users').updateOne(
          { username: req.user.email },
          { $set: { lastlogin: new Date(), updated_at: new Date() } }
        );
      } catch (error) {
        console.error('Error updating lastlogin for Google user:', error);
      }
    
      // Set session user
      req.session.user = {
        email: req.user.email,
        name: req.user.name
      };
      
      // Generate a temporary auth token for cross-app authentication
      const authToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      
      try {
        // Store the token in database temporarily
        await db.collection('temp_auth_tokens').deleteMany({
          user_username: req.user.email
        });
        
        await db.collection('temp_auth_tokens').insertOne({
          token: authToken,
          user_username: req.user.email,
          expires_at: expires,
          created_at: new Date()
        });
        
        // Redirect to private zone with token
        const privateZoneUrl = process.env.PRIVATE_ZONE_URL || 'http://localhost:3001';
        return res.redirect(`${privateZoneUrl}?token=${authToken}`);
      } catch (error) {
        console.error('Error creating Google OAuth token:', error);
        // Fallback
        const privateZoneUrl = process.env.PRIVATE_ZONE_URL || 'http://localhost:3001';
        res.redirect(privateZoneUrl);
      }
    }
  );
} else {
  // Provide disabled routes if Google OAuth is not configured
  app.get('/auth/google', (req, res) => {
    res.redirect('/login?error=google_oauth_disabled');
  });
}

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
    let sweetalertScript = undefined;
    
    // Check for Google OAuth disabled error
    if (req.query.error === 'google_oauth_disabled') {
        sweetalertScript = `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script><script>Swal.fire({icon: 'info', title: 'Google Sign-In Unavailable', text: 'Google Sign-In is currently not configured. Please use your email and password to login.', confirmButtonColor: '#3085d6', theme: 'auto'});</script>`;
    }
    
    res.render("index.ejs", {
        page: "login",
        message: undefined,
        method: 'GET',
        sweetalertScript,
        googleOAuthEnabled
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
        const existingUser = await db.collection('users').findOne({
          username: email
        });
        
        if (existingUser) {
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

        const newUser = {
          name: name,
          username: email,
          password: hash,
          entrydate: new Date(),
          lastlogin: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          is_active: true,
          role: 'user'
        };
        
        await db.collection('users').insertOne(newUser);
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
        await db.collection('users').updateOne(
          { username: user.email },
          { $set: { lastlogin: new Date(), updated_at: new Date() } }
        );
      } catch (error) {
        console.error('Error updating lastlogin:', error);
      }
      
      // Set session user
      req.session.user = {
        email: user.email,
        name: user.name
      };
      
      console.log('User logged in:', req.session.user);
      
      // Generate a temporary auth token for cross-app authentication
      const authToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      
      console.log('Creating auth token for user:', user.email);
      
      try {
        // First, delete any existing tokens for this user
        await db.collection('temp_auth_tokens').deleteMany({
          user_username: user.email
        });
        
        // Insert new token
        await db.collection('temp_auth_tokens').insertOne({
          token: authToken,
          user_username: user.email,
          expires_at: expires,
          created_at: new Date()
        });
        
        console.log('Auth token created successfully for user:', user.email);
        
        // Redirect to private zone app with token
        const privateZoneUrl = process.env.PRIVATE_ZONE_URL || 'http://localhost:3001';
        return res.redirect(`${privateZoneUrl}?token=${authToken}`);
      } catch (error) {
        console.error('Error creating auth token:', error);
        // Fallback to simple redirect
        const privateZoneUrl = process.env.PRIVATE_ZONE_URL || 'http://localhost:3001';
        return res.redirect(privateZoneUrl);
      }
    });
  })(req, res, next);
});

// Database connection and server startup
async function startServer() {
  try {
    await client.connect();
    db = client.db('private_zone');
    console.log('Connected to MongoDB successfully');
    app.listen(port, () => {
      console.log(`Public Site is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

startServer();
