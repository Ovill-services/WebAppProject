import ejs from 'ejs';
import express from 'express';
import pg from 'pg'; // Import pg for PostgreSQL connection
import bodyParser from 'body-parser';
import moment from 'moment';



const db = new pg.Client({
  user: "postgres",
  host: "172.21.48.1",
  database: "Ovill",
  password: ".mdArlYI1q56",
  port: 5432,
});

db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
        return;
    }
        console.log('Connected to the database');
});


const app = express();
const port = 3000;



// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static('public'));  

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

app.post('/post-message', (req, res) => {
    console.log('Received a request to post a message');
    // Here you would typically handle the form submission, e.g., save the message to a database
    // For this example, we'll just send a success 
    res.render('index.ejs', {
        page: 'contact',
        message: 'Thank you for contacting us! We will get back to you soon.',
        method: 'POST'
    });
    // Example of inserting into a database
    const query = `INSERT INTO reports (date, name, email, message) VALUES (${moment().format('YYYY-MM-DD HH:mm:ss')}, ${req.body.name}, ${req.body.email}, ${req.body.message});`;

    console.log('Database connection:', db);
    db.query(query, (err, result) => {
        if (err) {
            console.error('Error inserting message into database:', err);
        } else {
            console.log('Message inserted successfully:', result);
        }
        db.end((err) => {
            if (err) {
                console.error('Error closing database connection:', err);
            } else {
                console.log('Database connection closed');
            }
        });
    });
});


app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});