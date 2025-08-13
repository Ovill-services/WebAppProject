// Get email attachment
app.get('/api/emails/:emailId/attachments/:attachmentId', requireAuth, async (req, res) => {
    try {
        const { emailId, attachmentId } = req.params;
        
        // Verify the email belongs to the user
        const email = await db.collection('emails').findOne({
            _id: new ObjectId(emailId),
            user_email: req.session.user.email
        });
        
        if (!email) {
            return res.status(404).json({ error: 'Email not found' });
        }
        
        // Get attachment
        const attachment = await db.collection('email_attachments').findOne({
            _id: new ObjectId(attachmentId),
            email_id: new ObjectId(emailId)
        });
        
        if (!attachment) {
            return res.status(404).json({ error: 'Attachment not found' });
        }
        
        // If we have the attachment data stored, serve it directly
        if (attachment.attachment_data) {
            res.set({
                'Content-Type': attachment.mime_type,
                'Content-Length': attachment.attachment_data.length,
                'Content-Disposition': `inline; filename="${attachment.filename}"`
            });
            res.send(attachment.attachment_data.buffer);
        } else {
            // If we don't have the data stored, try to fetch it from Gmail
            try {
                // Get Gmail credentials for this user
                const integration = await db.collection('gmail_integration').findOne({
                    user_email: req.session.user.email,
                    is_active: true
                });
                
                if (!integration) {
                    return res.status(401).json({ error: 'Gmail integration not found' });
                }
                
                const { access_token, refresh_token } = integration;
                gmailService.setCredentials({ access_token, refresh_token });
                
                // Get the Gmail message ID for this email
                if (!email.gmail_message_id) {
                    return res.status(404).json({ error: 'Gmail message not found' });
                }
                
                const downloadedAttachment = await gmailService.getAttachment(email.gmail_message_id, attachment.gmail_attachment_id);
                const attachmentBuffer = Buffer.from(downloadedAttachment.data, 'base64');
                
                // Store the attachment data for future requests (if it's small enough)
                if (attachmentBuffer.length < 1024 * 1024) { // 1MB limit
                    await db.collection('email_attachments').updateOne(
                        { _id: new ObjectId(attachmentId) },
                        { $set: { attachment_data: attachmentBuffer } }
                    );
                }
                
                res.set({
                    'Content-Type': attachment.mime_type,
                    'Content-Length': attachmentBuffer.length,
                    'Content-Disposition': `inline; filename="${attachment.filename}"`
                });
                res.send(attachmentBuffer);
                
            } catch (gmailError) {
                console.error('Error fetching attachment from Gmail:', gmailError);
                res.status(500).json({ error: 'Failed to fetch attachment' });
            }
        }
        
    } catch (error) {
        console.error('Error serving attachment:', error);
        res.status(500).json({ error: 'Failed to serve attachment' });
    }
});

// Get email attachments list
app.get('/api/emails/:emailId/attachments', requireAuth, async (req, res) => {
    try {
        const { emailId } = req.params;
        
        // Verify the email belongs to the user
        const email = await db.collection('emails').findOne({
            _id: new ObjectId(emailId),
            user_email: req.session.user.email
        });
        
        if (!email) {
            return res.status(404).json({ error: 'Email not found' });
        }
        
        // Get attachments
        const attachments = await db.collection('email_attachments').find({
            email_id: new ObjectId(emailId)
        }, {
            projection: {
                _id: 1,
                filename: 1,
                mime_type: 1,
                size_bytes: 1,
                is_inline: 1,
                content_id: 1
            }
        }).sort({ filename: 1 }).toArray();
        
        res.json({
            success: true,
            attachments: attachments
        });
        
    } catch (error) {
        console.error('Error fetching attachments:', error);
        res.status(500).json({ error: 'Failed to fetch attachments' });
    }
});

// Get Gmail profile information
app.get('/api/gmail/profile', requireAuth, async (req, res) => {
    try {
        // Get user's Gmail tokens
        const integration = await db.collection('gmail_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Gmail integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = integration;
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await gmailService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : moment().add(1, 'hour').toDate();
                await db.collection('gmail_integration').updateOne(
                    { user_email: req.session.user.email },
                    { 
                        $set: { 
                            access_token: refreshedTokens.access_token, 
                            expires_at: newExpiresAt 
                        } 
                    }
                );
            } catch (refreshError) {
                console.error('Error refreshing Gmail token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Gmail token' });
            }
        }
        
        // Set credentials and get profile
        gmailService.setCredentials({ access_token, refresh_token });
        const profile = await gmailService.getProfile();
        
        res.json({
            success: true,
            profile: profile
        });
        
    } catch (error) {
        console.error('Error fetching Gmail profile:', error);
        res.status(500).json({ error: 'Failed to fetch Gmail profile' });
    }
});

// Send email via Gmail
app.post('/api/gmail/send', requireAuth, async (req, res) => {
    try {
        const { to, cc, bcc, subject, body } = req.body;
        
        if (!to || !subject || !body) {
            return res.status(400).json({
                success: false,
                message: 'To, subject, and body are required'
            });
        }
        
        // Get user's Gmail tokens
        const integration = await db.collection('gmail_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Gmail integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = integration;
        
        // Check if token needs refresh
        if (expires_at && new Date() >= new Date(expires_at)) {
            try {
                const refreshedTokens = await gmailService.refreshAccessToken(refresh_token);
                access_token = refreshedTokens.access_token;
                
                // Update tokens in database
                const newExpiresAt = refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date) : moment().add(1, 'hour').toDate();
                await db.collection('gmail_integration').updateOne(
                    { user_email: req.session.user.email },
                    { 
                        $set: { 
                            access_token: refreshedTokens.access_token, 
                            expires_at: newExpiresAt 
                        } 
                    }
                );
            } catch (refreshError) {
                console.error('Error refreshing Gmail token:', refreshError);
                return res.status(401).json({ error: 'Failed to refresh Gmail token' });
            }
        }
        
        // Set credentials and send email
        gmailService.setCredentials({ access_token, refresh_token });
        const sentMessage = await gmailService.sendMessage({ to, cc, bcc, subject, body });
        
        // Store sent email in database
        const emailDoc = {
            user_email: req.session.user.email,
            sender_email: req.session.user.email,
            recipient_email: to,
            cc_emails: cc || null,
            bcc_emails: bcc || null,
            subject: subject,
            body: body,
            is_read: true, // Sent emails are marked as read
            is_important: false,
            email_type: 'sent',
            gmail_message_id: sentMessage.id,
            synced_from_gmail: true,
            received_at: new Date(), // Use current time for sent emails
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const result = await db.collection('emails').insertOne(emailDoc);
        
        res.json({
            success: true,
            message: 'Email sent successfully via Gmail',
            email: { ...emailDoc, _id: result.insertedId },
            gmailMessageId: sentMessage.id
        });
        
    } catch (error) {
        console.error('Error sending Gmail message:', error);
        res.status(500).json({ error: 'Failed to send email via Gmail' });
    }
});

// Mark Gmail message as read/unread
app.put('/api/gmail/messages/:messageId/read', requireAuth, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { isRead } = req.body;
        
        // Get user's Gmail tokens
        const integration = await db.collection('gmail_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Gmail integration not found' });
        }
        
        const { access_token, refresh_token } = integration;
        
        // Set credentials and mark as read/unread
        gmailService.setCredentials({ access_token, refresh_token });
        
        if (isRead) {
            await gmailService.markAsRead(messageId);
        } else {
            await gmailService.markAsUnread(messageId);
        }
        
        // Update local database
        await db.collection('emails').updateOne(
            { gmail_message_id: messageId, user_email: req.session.user.email },
            { $set: { is_read: isRead, updated_at: new Date() } }
        );
        
        res.json({
            success: true,
            message: `Message marked as ${isRead ? 'read' : 'unread'}`
        });
        
    } catch (error) {
        console.error('Error updating Gmail message read status:', error);
        res.status(500).json({ error: 'Failed to update message status' });
    }
});

// Delete Gmail message
app.delete('/api/gmail/messages/:messageId', requireAuth, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        // Get user's Gmail tokens
        const integration = await db.collection('gmail_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Gmail integration not found' });
        }
        
        const { access_token, refresh_token } = integration;
        
        // Set credentials and delete message
        gmailService.setCredentials({ access_token, refresh_token });
        await gmailService.deleteMessage(messageId);
        
        // Update local database
        await db.collection('emails').deleteOne({
            gmail_message_id: messageId,
            user_email: req.session.user.email
        });
        
        res.json({
            success: true,
            message: 'Gmail message deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting Gmail message:', error);
        res.status(500).json({ error: 'Failed to delete Gmail message' });
    }
});

// Email API Routes
// Get all emails for the authenticated user
app.get('/api/emails', requireAuth, async (req, res) => {
    try {
        const { filter, search } = req.query;
        let query = { user_email: req.session.user.email };
        
        // Apply filters
        if (filter === 'unread') {
            query.is_read = false;
        } else if (filter === 'read') {
            query.is_read = true;
        } else if (filter === 'important') {
            query.is_important = true;
        }
        
        // Apply search
        if (search) {
            query.$or = [
                { subject: { $regex: search, $options: 'i' } },
                { sender_email: { $regex: search, $options: 'i' } },
                { body: { $regex: search, $options: 'i' } }
            ];
        }
        
        const emails = await db.collection('emails').find(query)
            .sort({ received_at: -1, created_at: -1 })
            .toArray();
        
        res.json({
            success: true,
            emails: emails
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
        
        const emailDoc = {
            user_email: req.session.user.email, // user_email (owner)
            sender_email: req.session.user.email, // sender_email
            recipient_email: to, // recipient_email
            cc_emails: cc || null, // cc_emails
            bcc_emails: bcc || null, // bcc_emails
            subject: subject,
            body: body,
            is_important: isImportant || false,
            is_draft: isDraft || false,
            email_type: isDraft ? 'draft' : 'sent',
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const result = await db.collection('emails').insertOne(emailDoc);
        
        res.json({
            success: true,
            message: isDraft ? 'Draft saved successfully' : 'Email sent successfully',
            email: { ...emailDoc, _id: result.insertedId }
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
        const emailId = req.params.id;
        const { isRead } = req.body;
        
        const result = await db.collection('emails').findOneAndUpdate(
            { _id: new ObjectId(emailId), user_email: req.session.user.email },
            { $set: { is_read: isRead, updated_at: new Date() } },
            { returnDocument: 'after' }
        );
        
        if (!result.value) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        
        res.json({
            success: true,
            email: result.value
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
        const emailId = req.params.id;
        const { isImportant } = req.body;
        
        const result = await db.collection('emails').findOneAndUpdate(
            { _id: new ObjectId(emailId), user_email: req.session.user.email },
            { $set: { is_important: isImportant, updated_at: new Date() } },
            { returnDocument: 'after' }
        );
        
        if (!result.value) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        
        res.json({
            success: true,
            email: result.value
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
        const emailId = req.params.id;
        
        const result = await db.collection('emails').findOneAndDelete({
            _id: new ObjectId(emailId),
            user_email: req.session.user.email
        });
        
        if (!result.value) {
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
        const emailId = req.params.id;
        
        const email = await db.collection('emails').findOne({
            _id: new ObjectId(emailId),
            user_email: req.session.user.email
        });
        
        if (!email) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        
        res.json({
            success: true,
            email: email
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
        const result = await db.collection('users').findOneAndUpdate(
            { username: req.session.user.email },
            { 
                $set: { 
                    name: name, 
                    username: email, 
                    phone: phone, 
                    bio: bio, 
                    job_title: jobTitle, 
                    company: company, 
                    skills: skills,
                    updated_at: new Date()
                } 
            },
            { returnDocument: 'after' }
        );
        
        // Update session data
        req.session.user = {
            name: name,
            email: email
        };
        
        res.json({ 
            success: true, 
            message: 'Profile updated successfully',
            avatar_url: result.value?.avatar_url
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
        const result = await db.collection('users').findOneAndUpdate(
            { username: req.session.user.email },
            { $set: { avatar_url: avatarUrl, updated_at: new Date() } },
            { returnDocument: 'after' }
        );
        
        res.json({ 
            success: true, 
            message: 'Avatar uploaded successfully',
            avatar_url: result.value?.avatar_url
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

// Dashboard Statistics API
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
    try {
        const userEmail = req.session.user.email;
        
        // Get email count
        const emailCount = await db.collection('emails').countDocuments({
            user_email: userEmail
        });
        
        // Get task statistics
        const taskStats = await db.collection('tasks').aggregate([
            { $match: { user_email: userEmail } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: ["$completed", 1, 0] } },
                    pending: { $sum: { $cond: ["$completed", 0, 1] } }
                }
            }
        ]).toArray();
        
        const taskStatistics = taskStats.length > 0 ? taskStats[0] : { total: 0, completed: 0, pending: 0 };
        
        // Get recent emails (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentEmailCount = await db.collection('emails').countDocuments({
            user_email: userEmail,
            received_at: { $gte: sevenDaysAgo }
        });
        
        // Get tasks created today
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        
        const todayTaskCount = await db.collection('tasks').countDocuments({
            user_email: userEmail,
            created_at: { $gte: startOfToday, $lte: endOfToday }
        });
        
        // Get tasks completed today
        const completedTodayCount = await db.collection('tasks').countDocuments({
            user_email: userEmail,
            completed: true,
            updated_at: { $gte: startOfToday, $lte: endOfToday }
        });
        
        // Get nearest upcoming event
        const upcomingEvent = await db.collection('calendar_events').findOne(
            {
                user_email: userEmail,
                start_time: { $gte: new Date() }
            },
            { sort: { start_time: 1 } }
        );
        
        console.log('Upcoming event query result:', upcomingEvent);
        
        // Get recent activity for the chart (last 7 days)
        const activityData = await db.collection('emails').aggregate([
            {
                $match: {
                    user_email: userEmail,
                    created_at: { $gte: sevenDaysAgo }
                }
            },
            {
                $addFields: {
                    date: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$created_at"
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$date",
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: -1 } },
            { $limit: 7 }
        ]).toArray();
        
        // Format activity data for chart
        const formattedActivityData = activityData.map(item => ({
            date: item._id,
            count: item.count
        }));
        
        // Get recent activity log entries
        const recentActivities = await db.collection('emails').aggregate([
            {
                $match: { user_email: userEmail }
            },
            {
                $addFields: {
                    type: "email",
                    action: "Email Received",
                    details: "$subject",
                    timestamp: "$received_at"
                }
            },
            {
                $unionWith: {
                    coll: "tasks",
                    pipeline: [
                        { $match: { user_email: userEmail } },
                        {
                            $addFields: {
                                type: "task",
                                action: { $cond: ["$completed", "Task Completed", "Task Created"] },
                                details: "$text",
                                timestamp: { $ifNull: ["$updated_at", "$created_at"] }
                            }
                        }
                    ]
                }
            },
            { $sort: { timestamp: -1 } },
            { $limit: 5 },
            {
                $project: {
                    type: 1,
                    action: 1,
                    details: 1,
                    timestamp: 1
                }
            }
        ]).toArray();
        
        res.json({
            success: true,
            stats: {
                emails: {
                    total: emailCount,
                    recent: recentEmailCount,
                    trend: recentEmailCount > 0 ? '+' + Math.round((recentEmailCount / 7) * 30) + '% this month' : 'No recent activity'
                },
                tasks: {
                    total: taskStatistics.total,
                    completed: taskStatistics.completed,
                    pending: taskStatistics.pending,
                    todayCreated: todayTaskCount,
                    completedToday: completedTodayCount,
                    trend: todayTaskCount > 0 ? `+${todayTaskCount} today` : 'No tasks today'
                },
                upcomingEvent: upcomingEvent,
                activity: {
                    chartData: formattedActivityData,
                    recentActivities: recentActivities
                }
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard statistics'
        });
    }
});

// Task Management API Routes

// Get all tasks for the authenticated user
app.get('/api/tasks', requireAuth, async (req, res) => {
    try {
        const tasks = await db.collection('tasks').find({
            user_email: req.session.user.email
        }).sort({ created_at: -1 }).toArray();
        
        res.json({
            success: true,
            tasks: tasks
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
        
        const taskDoc = {
            user_email: req.session.user.email,
            title: text.trim(),
            text: text.trim(),
            completed: false,
            source: taskSource,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const result = await db.collection('tasks').insertOne(taskDoc);
        
        res.json({
            success: true,
            task: { ...taskDoc, _id: result.insertedId },
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
        const taskId = req.params.id;
        const { text, completed, source } = req.body;
        
        // First check if the task belongs to the user
        const existingTask = await db.collection('tasks').findOne({
            _id: new ObjectId(taskId),
            user_email: req.session.user.email
        });
        
        if (!existingTask) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Validate source if provided
        const validSources = ['user', 'google_tasks', 'microsoft_todo', 'calendar_integration'];
        
        // Build update object
        const updateFields = { updated_at: new Date() };
        
        if (text !== undefined) {
            updateFields.text = text.trim();
            updateFields.title = text.trim();
        }
        
        if (completed !== undefined) {
            updateFields.completed = completed;
        }
        
        if (source !== undefined && validSources.includes(source)) {
            updateFields.source = source;
        }
        
        const result = await db.collection('tasks').findOneAndUpdate(
            { _id: new ObjectId(taskId), user_email: req.session.user.email },
            { $set: updateFields },
            { returnDocument: 'after' }
        );
        
        res.json({
            success: true,
            task: result.value,
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
        const taskId = req.params.id;
        
        // First check if the task belongs to the user, then delete
        const result = await db.collection('tasks').findOneAndDelete({
            _id: new ObjectId(taskId),
            user_email: req.session.user.email
        });
        
        if (!result.value) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Task deleted successfully',
            deletedTask: result.value
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
        
        const objectIds = taskIds.map(id => new ObjectId(id));
        let result;
        
        switch (action) {
            case 'complete':
                result = await db.collection('tasks').updateMany(
                    { _id: { $in: objectIds }, user_email: req.session.user.email },
                    { $set: { completed: true, updated_at: new Date() } }
                );
                break;
            case 'uncomplete':
                result = await db.collection('tasks').updateMany(
                    { _id: { $in: objectIds }, user_email: req.session.user.email },
                    { $set: { completed: false, updated_at: new Date() } }
                );
                break;
            case 'delete':
                result = await db.collection('tasks').deleteMany({
                    _id: { $in: objectIds },
                    user_email: req.session.user.email
                });
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid bulk action'
                });
        }
        
        res.json({
            success: true,
            affectedCount: result.modifiedCount || result.deletedCount,
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

// Google Tasks integration

// Get Google Tasks integration status
app.get('/api/google/tasks/status', requireAuth, async (req, res) => {
    try {
        const integration = await db.collection('google_tasks_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        const isConnected = !!integration;
        res.json({ 
            connected: isConnected,
            connectedSince: isConnected ? integration.created_at : null,
            taskInfo: isConnected ? integration.task_info : null
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
        const integration = await db.collection('google_tasks_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Google Tasks integration not found' });
        }
        
        let { access_token, refresh_token, expires_at } = integration;
        
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
            const existingTask = await db.collection('tasks').findOne({
                google_task_id: googleTask.id,
                user_email: req.session.user.email
            });
            
            const taskData = {
                title: googleTask.title,
                text: googleTask.title,
                completed: googleTask.status === 'completed',
                source: 'google_tasks',
                updated_at: new Date()
            };
            
            if (!existingTask) {
                // Insert new task
                const result = await db.collection('tasks').insertOne({
                    ...taskData,
                    user_email: req.session.user.email,
                    google_task_id: googleTask.id,
                    created_at: new Date()
                });
                syncedTasks.push({ ...taskData, _id: result.insertedId });
            } else {
                // Update existing task
                const result = await db.collection('tasks').findOneAndUpdate(
                    { google_task_id: googleTask.id, user_email: req.session.user.email },
                    { $set: taskData },
                    { returnDocument: 'after' }
                );
                syncedTasks.push(result.value);
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
        const task = await db.collection('tasks').findOne({
            _id: new ObjectId(taskId),
            user_email: req.session.user.email
        });
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        // Get user's Google Tasks tokens
        const integration = await db.collection('google_tasks_integration').findOne({
            user_email: req.session.user.email,
            is_active: true
        });
        
        if (!integration) {
            return res.status(401).json({ error: 'Google Tasks integration not found' });
        }
        
        const { access_token } = integration;
        
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
        await db.collection('tasks').updateOne(
            { _id: new ObjectId(taskId) },
            { 
                $set: { 
                    google_task_id: createdGoogleTask.id, 
                    source: 'google_tasks',
                    updated_at: new Date()
                } 
            }
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

// Health check endpoint for Docker
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'private-zone-app'
    });
});

// Database connection and server startup
async function startServer() {
    try {
        await client.connect();
        db = client.db('private_zone');
        console.log('Connected to MongoDB successfully');
        
        app.listen(port, () => {
            console.log(`Private Zone App is running at http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);
    }
}

startServer();
