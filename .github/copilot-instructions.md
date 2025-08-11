# GitHub Copilot Instructions

## Final Product
- The final product should be an app to which you can connect your google, microsoft, yahoo, apple, ... Accounts and see your emails and calendar events in one place.


## Coding Standards

### Authentication & Security
- Always use `requireAuth` middleware for protected routes
- Session user email is stored as `req.session.user.email`
- Always filter user data by `user_email = req.session.user.email`
- Use parameterized queries to prevent SQL injection

### API Response Format
- Success responses: `{ success: true, data/message: ... }`
- Error responses: `{ success: false, message: "Error description" }`
- Use appropriate HTTP status codes (400, 404, 500, etc.)

### Database Patterns
- Always use parameterized queries with `$1, $2, etc.`
- Check if results exist: `if (result.rows.length === 0)`
- Use `CURRENT_TIMESTAMP` for PostgreSQL timestamps
- Include proper error logging with `console.error`

### Express Route Structure
```javascript
app.get('/api/resource', requireAuth, async (req, res) => {
    try {
        const userEmail = req.session.user.email;
        
        // Validation
        if (!requiredParam) {
            return res.status(400).json({
                success: false,
                message: 'Parameter required'
            });
        }
        
        // Database operation
        const query = 'SELECT * FROM table WHERE user_email = $1';
        const result = await db.query(query, [userEmail]);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error description:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
```

### Google API Integration
- Always check token expiration before API calls
- Refresh tokens when expired using the refresh_token flow
- Store credentials in database tables: `gmail_integration`, `google_calendar_integration`
- Handle API errors gracefully

## Database Schema Notes
- Users table: `username` field stores email addresses
- All user-specific tables filter by `user_email`
- Email attachments stored in `email_attachments` table
- Tasks have `source` field for integration tracking



## How To Run the Application
- cd to the project directory
- use './docker-manager.sh start' to start the Docker containe
- private zone is available at `http://localhost:3001`
- public zone is available at `http://localhost:3000`

## How To Restart The Application
always:
- use './docker-manager.sh restart' to restart the Docker containers
- for starting only private zone, use './docker-manager.sh start-private-zone-app'
- for starting only public site, use './docker-manager.sh start-public-site'


## How To Stop The Application
- use './docker-manager.sh stop' to stop the Docker containers



## Style Guide
- always add styles to the `public/styles.css` file
- use bootstrap when you can
- ensure responsive design for mobile and desktop views
- for coloring elements with bootstrap, use classes like 'bg-body', 'text-body' for theme selection
- dont add too much contrast to the design, keep it simple and clean
- make sure the design is consistent across all pages with similar colors
- there sholdnt be too many colors, use a limited palette
-there sholdnt be almost any inline styles, use classes instead



## For changing or checking things in the database
- always use the password in the `.env` file in the command to connect to the database

