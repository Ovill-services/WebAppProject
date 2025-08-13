#!/bin/bash

# MongoDB Migration Script
# This script migrates data from PostgreSQL to MongoDB

echo "🚀 Starting MongoDB Migration Process..."

# Check if PostgreSQL is running
if ! docker ps | grep -q postgres; then
    echo "❌ PostgreSQL container is not running. Starting it temporarily for migration..."
    docker run -d --name postgres-temp \
        --network test_app-network \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=mysecretpassword \
        -e POSTGRES_DB=Ovill \
        -p 5434:5432 \
        postgres:15
    
    echo "⏳ Waiting for PostgreSQL to start..."
    sleep 10
fi

# Check if MongoDB is running
if ! docker ps | grep -q mongodb; then
    echo "❌ MongoDB container is not running. Please start it first with:"
    echo "   ./docker-manager.sh start"
    exit 1
fi

echo "✅ Databases are running. Starting migration..."

# Export data from PostgreSQL and import to MongoDB using Node.js script
cat > migrate-data.js << 'EOF'
import { MongoClient } from 'mongodb';
import pg from 'pg';

// Database connections
const mongoUri = 'mongodb://admin:secretpassword@localhost:27017/private_zone?authSource=admin';
const pgConfig = {
  user: 'postgres',
  host: 'localhost',
  database: 'Ovill',
  password: 'mysecretpassword',
  port: 5434,
};

async function migrateData() {
  const mongoClient = new MongoClient(mongoUri);
  const pgClient = new pg.Client(pgConfig);
  
  try {
    // Connect to databases
    await mongoClient.connect();
    await pgClient.connect();
    
    const mongodb = mongoClient.db('private_zone');
    
    console.log('📊 Connected to both databases. Starting migration...');
    
    // Migrate Users
    console.log('👥 Migrating users...');
    const usersResult = await pgClient.query('SELECT * FROM users');
    if (usersResult.rows.length > 0) {
      const mongoUsers = usersResult.rows.map(user => ({
        username: user.username,
        name: user.name,
        password: user.password,
        email: user.email,
        google_id: user.google_id,
        entrydate: user.entrydate,
        lastlogin: user.lastlogin,
        created_at: user.created_at || user.entrydate,
        updated_at: user.updated_at || user.entrydate,
        is_active: user.is_active !== false,
        role: user.role || 'user',
        avatar_url: user.avatar_url,
        phone: user.phone,
        bio: user.bio,
        job_title: user.job_title,
        company: user.company,
        skills: user.skills
      }));
      
      // Clear existing users and insert new ones
      await mongodb.collection('users').deleteMany({});
      await mongodb.collection('users').insertMany(mongoUsers);
      console.log(`✅ Migrated ${mongoUsers.length} users`);
    }
    
    // Migrate Emails
    console.log('📧 Migrating emails...');
    const emailsResult = await pgClient.query('SELECT * FROM emails ORDER BY created_at DESC');
    if (emailsResult.rows.length > 0) {
      const mongoEmails = emailsResult.rows.map(email => ({
        user_email: email.user_email,
        sender_email: email.sender_email,
        recipient_email: email.recipient_email,
        cc_emails: email.cc_emails,
        bcc_emails: email.bcc_emails,
        subject: email.subject,
        body: email.body,
        is_read: email.is_read || false,
        is_important: email.is_important || false,
        is_draft: email.is_draft || false,
        email_type: email.email_type || 'received',
        gmail_message_id: email.gmail_message_id,
        gmail_thread_id: email.gmail_thread_id,
        gmail_labels: email.gmail_labels,
        snippet: email.snippet,
        synced_from_gmail: email.synced_from_gmail || false,
        received_at: email.received_at || email.created_at,
        created_at: email.created_at,
        updated_at: email.updated_at || email.created_at
      }));
      
      await mongodb.collection('emails').deleteMany({});
      await mongodb.collection('emails').insertMany(mongoEmails);
      console.log(`✅ Migrated ${mongoEmails.length} emails`);
    }
    
    // Migrate Calendar Events
    console.log('📅 Migrating calendar events...');
    try {
      const eventsResult = await pgClient.query('SELECT * FROM calendar_events ORDER BY created_at DESC');
      if (eventsResult.rows.length > 0) {
        const mongoEvents = eventsResult.rows.map(event => ({
          user_email: event.user_email,
          title: event.title,
          description: event.description,
          start_time: event.start_time,
          end_time: event.end_time,
          location: event.location,
          is_all_day: event.is_all_day || false,
          event_type: event.event_type || 'user',
          google_event_id: event.google_event_id,
          recurrence_rule: event.recurrence_rule,
          attendees: event.attendees,
          reminder_minutes: event.reminder_minutes || 15,
          is_cancelled: event.is_cancelled || false,
          created_at: event.created_at,
          updated_at: event.updated_at || event.created_at
        }));
        
        await mongodb.collection('calendar_events').deleteMany({});
        await mongodb.collection('calendar_events').insertMany(mongoEvents);
        console.log(`✅ Migrated ${mongoEvents.length} calendar events`);
      }
    } catch (error) {
      console.log('⚠️ Calendar events table not found, skipping...');
    }
    
    // Migrate Tasks
    console.log('✅ Migrating tasks...');
    try {
      const tasksResult = await pgClient.query('SELECT * FROM tasks ORDER BY created_at DESC');
      if (tasksResult.rows.length > 0) {
        const mongoTasks = tasksResult.rows.map(task => ({
          user_email: task.user_email,
          title: task.title || task.text,
          text: task.text,
          completed: task.completed || false,
          source: task.source || 'user',
          google_task_id: task.google_task_id,
          created_at: task.created_at,
          updated_at: task.updated_at || task.created_at
        }));
        
        await mongodb.collection('tasks').deleteMany({});
        await mongodb.collection('tasks').insertMany(mongoTasks);
        console.log(`✅ Migrated ${mongoTasks.length} tasks`);
      }
    } catch (error) {
      console.log('⚠️ Tasks table not found, skipping...');
    }
    
    // Migrate Gmail Integration
    console.log('🔗 Migrating Gmail integrations...');
    try {
      const gmailResult = await pgClient.query('SELECT * FROM gmail_integration');
      if (gmailResult.rows.length > 0) {
        const mongoGmail = gmailResult.rows.map(gmail => ({
          user_email: gmail.user_email,
          access_token: gmail.access_token,
          refresh_token: gmail.refresh_token,
          expires_at: gmail.expires_at,
          gmail_email: gmail.gmail_email,
          is_active: gmail.is_active !== false,
          created_at: gmail.created_at,
          updated_at: gmail.updated_at || gmail.created_at
        }));
        
        await mongodb.collection('gmail_integration').deleteMany({});
        await mongodb.collection('gmail_integration').insertMany(mongoGmail);
        console.log(`✅ Migrated ${mongoGmail.length} Gmail integrations`);
      }
    } catch (error) {
      console.log('⚠️ Gmail integration table not found, skipping...');
    }
    
    // Migrate Google Calendar Integration
    console.log('📆 Migrating Google Calendar integrations...');
    try {
      const calendarResult = await pgClient.query('SELECT * FROM google_calendar_integration');
      if (calendarResult.rows.length > 0) {
        const mongoCalendar = calendarResult.rows.map(cal => ({
          user_email: cal.user_email,
          access_token: cal.access_token,
          refresh_token: cal.refresh_token,
          expires_at: cal.expires_at,
          scope: cal.scope,
          calendar_info: cal.calendar_info,
          is_active: cal.is_active !== false,
          created_at: cal.created_at,
          updated_at: cal.updated_at || cal.created_at
        }));
        
        await mongodb.collection('google_calendar_integration').deleteMany({});
        await mongodb.collection('google_calendar_integration').insertMany(mongoCalendar);
        console.log(`✅ Migrated ${mongoCalendar.length} Google Calendar integrations`);
      }
    } catch (error) {
      console.log('⚠️ Google Calendar integration table not found, skipping...');
    }
    
    // Migrate Email Attachments
    console.log('📎 Migrating email attachments...');
    try {
      const attachmentsResult = await pgClient.query('SELECT * FROM email_attachments');
      if (attachmentsResult.rows.length > 0) {
        const mongoAttachments = attachmentsResult.rows.map(att => ({
          email_id: att.email_id, // Note: this will need to be mapped to MongoDB ObjectId later
          filename: att.filename,
          original_filename: att.original_filename,
          mime_type: att.mime_type,
          size_bytes: att.size_bytes,
          attachment_data: att.attachment_data,
          gmail_attachment_id: att.gmail_attachment_id,
          is_inline: att.is_inline || false,
          content_id: att.content_id,
          created_at: att.created_at
        }));
        
        await mongodb.collection('email_attachments').deleteMany({});
        await mongodb.collection('email_attachments').insertMany(mongoAttachments);
        console.log(`✅ Migrated ${mongoAttachments.length} email attachments`);
        console.log('⚠️ Note: Email attachment email_id references need manual mapping to MongoDB ObjectIds');
      }
    } catch (error) {
      console.log('⚠️ Email attachments table not found, skipping...');
    }
    
    console.log('🎉 Migration completed successfully!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Test the application with MongoDB');
    console.log('2. Install dependencies: cd private-zone-app && npm install');
    console.log('3. Install dependencies: cd ../public-site && npm install');
    console.log('4. Restart the applications: ./docker-manager.sh restart');
    console.log('5. If everything works, you can remove PostgreSQL from docker-compose.yml');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoClient.close();
    await pgClient.end();
  }
}

migrateData();
EOF

# Run the migration script
echo "🔄 Running data migration script..."
cd /home/oren/test
node migrate-data.js

# Clean up
rm migrate-data.js

# Stop temporary PostgreSQL if we started it
if docker ps | grep -q postgres-temp; then
    echo "🧹 Cleaning up temporary PostgreSQL container..."
    docker stop postgres-temp
    docker rm postgres-temp
fi

echo ""
echo "✅ MongoDB migration completed!"
echo ""
echo "🔄 Next steps:"
echo "1. Install new dependencies in both applications:"
echo "   cd private-zone-app && npm install"
echo "   cd ../public-site && npm install"
echo ""
echo "2. Restart the applications:"
echo "   ./docker-manager.sh restart"
echo ""
echo "3. Test the applications at:"
echo "   - Public site: http://localhost:3000"
echo "   - Private zone: http://localhost:3001"
echo ""
echo "4. Check Mongo Express for database contents:"
echo "   http://localhost:8081 (admin/admin123)"
echo ""
echo "🗑️ If everything works well, you can safely remove PostgreSQL:"
echo "   - Edit docker-compose.yml to remove postgres service"
echo "   - Remove PostgreSQL data: docker volume rm test_postgres_data"
