// MongoDB initialization script
// This will run when MongoDB container starts for the first time

// Switch to the private_zone database
db = db.getSiblingDB('private_zone');

// Create collections and indexes for email system
db.createCollection('emails');
db.createCollection('users');
db.createCollection('sessions');

// Create indexes for emails collection
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

// Create indexes for users collection
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "google_id": 1 }, { sparse: true, unique: true });

// Create a sample admin user (optional)
db.users.insertOne({
  email: "admin@localhost",
  username: "admin",
  created_at: new Date(),
  is_active: true,
  role: "admin"
});

print("MongoDB initialized successfully for private_zone database");
