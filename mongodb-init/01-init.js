// MongoDB initialization script
// This will run when MongoDB container starts for the first time

// Switch to the private_zone database
db = db.getSiblingDB('private_zone');

// Create collections and indexes
db.createCollection('users');
db.createCollection('emails');
db.createCollection('calendar_events');
db.createCollection('tasks');
db.createCollection('gmail_integration');
db.createCollection('google_calendar_integration');
db.createCollection('google_tasks_integration');
db.createCollection('email_attachments');
db.createCollection('sessions');

// Create indexes for users collection
db.users.createIndex({ "username": 1 }, { unique: true });
db.users.createIndex({ "email": 1 }, { sparse: true, unique: true });
db.users.createIndex({ "google_id": 1 }, { sparse: true, unique: true });

// Create indexes for emails collection
db.emails.createIndex({ "user_email": 1, "received_at": -1 });
db.emails.createIndex({ "sender_email": 1, "created_at": -1 });
db.emails.createIndex({ "recipient_email": 1, "created_at": -1 });
db.emails.createIndex({ "is_read": 1, "is_important": 1 });
db.emails.createIndex({ "gmail_message_id": 1 }, { sparse: true });
db.emails.createIndex({ 
  "subject": "text", 
  "body": "text", 
  "sender_email": "text" 
}, { 
  name: "email_text_search" 
});

// Create indexes for calendar_events collection
db.calendar_events.createIndex({ "user_email": 1, "start_time": 1 });
db.calendar_events.createIndex({ "google_event_id": 1 }, { sparse: true });
db.calendar_events.createIndex({ "user_email": 1, "start_time": 1, "is_cancelled": 1 });

// Create indexes for tasks collection
db.tasks.createIndex({ "user_email": 1, "created_at": -1 });
db.tasks.createIndex({ "google_task_id": 1 }, { sparse: true });

// Create indexes for integrations
db.gmail_integration.createIndex({ "user_email": 1 }, { unique: true });
db.google_calendar_integration.createIndex({ "user_email": 1 }, { unique: true });
db.google_tasks_integration.createIndex({ "user_email": 1 }, { unique: true });

// Create indexes for email attachments
db.email_attachments.createIndex({ "email_id": 1 });
db.email_attachments.createIndex({ "gmail_attachment_id": 1 }, { sparse: true });

// Create indexes for sessions
db.sessions.createIndex({ "sid": 1 }, { unique: true });
db.sessions.createIndex({ "expires": 1 }, { expireAfterSeconds: 0 });

// Create a sample admin user (optional)
try {
  db.users.insertOne({
    username: "admin",
    name: "Administrator",
    password: "admin123", // In production, this should be hashed
    email: "admin@localhost",
    entrydate: new Date(),
    lastlogin: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    is_active: true,
    role: "admin"
  });
} catch (e) {
  print("Admin user already exists or error inserting:", e.message);
}

// Insert sample email data
try {
  db.emails.insertMany([
    {
      user_email: "test@example.com",
      sender_email: "john.doe@example.com",
      recipient_email: "test@example.com",
      subject: "Welcome to the Team!",
      body: "Hi there,\n\nWelcome to our amazing team! We're excited to have you on board.\n\nBest regards,\nJohn Doe",
      is_read: false,
      is_important: true,
      email_type: "received",
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      received_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
      synced_from_gmail: false
    },
    {
      user_email: "test@example.com",
      sender_email: "hr@company.com",
      recipient_email: "test@example.com",
      subject: "Monthly Report Due",
      body: "Dear Team,\n\nPlease submit your monthly reports by Friday.\n\nThanks,\nHR Department",
      is_read: true,
      is_important: false,
      email_type: "received",
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      received_at: new Date(Date.now() - 5 * 60 * 60 * 1000),
      synced_from_gmail: false
    },
    {
      user_email: "test@example.com",
      sender_email: "newsletter@tech.com",
      recipient_email: "test@example.com",
      subject: "Weekly Tech Newsletter",
      body: "This week in tech: AI advances, new frameworks, and industry insights.\n\nRead more...",
      is_read: false,
      is_important: false,
      email_type: "received",
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      received_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
      synced_from_gmail: false
    }
  ]);
} catch (e) {
  print("Sample emails already exist or error inserting:", e.message);
}

print("MongoDB initialized successfully for private_zone database");
print("Collections created: users, emails, calendar_events, tasks, gmail_integration, google_calendar_integration, google_tasks_integration, email_attachments, sessions");
print("Indexes created for optimal performance");
print("Sample data inserted for testing");
