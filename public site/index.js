import ejs from 'ejs';
import express from 'express';
import pg from 'pg'; // Import pg for PostgreSQL connection
import bodyParser from 'body-parser';
import moment from 'moment';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "Ovill",
  password: "mysecretpassword",
  port: 5433,
});

const app = express();
const port = 3000;

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.use(express.static('public'));  
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

app.get("/signup", (req, res) => {
    res.render("index.ejs", {
        page: "SignUp",
        message: undefined,
        method: 'GET'
    });
});

app.post('/post-message', async (req, res) => {
    console.log('Received a request to post a message');
    const { name, email, message } = req.body;
    const query = 'INSERT INTO reports (name, email, message) VALUES ($1, $2, $3)';
    const values = [name, email, message];
    try {
        await db.query(query, values);
        console.log('Message inserted into database successfully');
        res.render('index.ejs', {
            page: 'contact',
            message: 'Thank you for contacting us! We will get back to you soon.',
            method: 'POST'
        });
    } catch (error) {
        console.error('Error inserting message into database:', error);
        res.render('index.ejs', {
            page: 'contact',
            message: 'There was an error submitting your message. Please try again later.',
            method: 'POST'
        });
    }
});

app.post('/register', async (req, res) => {
    console.log('Received a request to register a user');
    const { name, email, password } = req.body;

    // Hash the password using SHA256
    const hash = crypto.createHash('sha256').update(password).digest('hex');

    const query = 'INSERT INTO users (name, username, password, entrydate, lastlogin) VALUES ($1, $2, $3, $4, $5)';
    const values = [name, email, hash, moment().format('YYYY-MM-DD HH:mm:ss'), moment().format('YYYY-MM-DD HH:mm:ss')];
    try {
        await db.query(query, values);
        console.log('User registered successfully');
        res.render('index.ejs', {
            page: 'login',
            message: 'Registration successful! Please log in.',
            method: 'POST'
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.render('index.ejs', {
            page: 'SignUp',
            message: 'There was an error registering your account. Please try again later.',
            method: 'POST'
        });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const query = 'SELECT * FROM users WHERE username = $1 AND password = $2';
    const values = [email, hash];
    let sweetalertScript = '';
    try {
        const result = await db.query(query, values);
        if (result.rows.length > 0) {
            // Login successful: update lastlogin
            const updateQuery = 'UPDATE users SET lastlogin = $1 WHERE username = $2';
            const updateValues = [moment().format('YYYY-MM-DD HH:mm:ss'), email];
            await db.query(updateQuery, updateValues);
            // Set session user
            req.session.user = {
                email: email,
                // Add other user properties if needed
            };
            // Redirect to private zone after login
            return res.redirect('/private-zone');
        } else {
            // Login failed
            sweetalertScript = `<script src=\"https://cdn.jsdelivr.net/npm/sweetalert2@11\"></script><script>Swal.fire({icon: 'error', title: 'Invalid email or password. Please try again.', confirmButtonColor: '#3085d6', theme: 'auto'});</script>`;
            res.render('index.ejs', {
                page: 'login',
                sweetalertScript,
                method: 'POST'
            });
        }
    } catch (error) {
        console.error('Error during login:', error);
        sweetalertScript = `<script src=\"https://cdn.jsdelivr.net/npm/sweetalert2@11\"></script><script>Swal.fire({icon: 'error', title: 'There was an error logging in. Please try again later.', confirmButtonColor: '#3085d6', theme: 'auto'});</script>`;
        res.render('index.ejs', {
            page: 'login',
            sweetalertScript,
            method: 'POST'
        });
    }
});

app.get('/private-zone', (req, res) => {
    // Simple session check for demonstration
    if (req.session && req.session.user) {
        res.render('privatezone/views/index.ejs', {
            message: `Welcome to your private zone, ${req.session.user.email}!`,
            method: 'GET',
        });
    } else {
        res.redirect('/login');
    }
});

// Move DB connect and app.listen to an async startup function
async function startServer() {
  try {
    await db.connect();
    console.log('Connected to the database successfully');
    app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Error connecting to the database:', error);
    process.exit(1);
  }
}

startServer();