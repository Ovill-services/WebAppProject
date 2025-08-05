# Private Zone Applications - Docker Setup

This project contains two Node.js applications containerized with Docker and ready for MongoDB migration.

## Project Structure

```
├── docker-compose.yml          # Multi-container Docker application
├── docker-manager.sh          # Convenience script for managing containers
├── .env.example               # Environment variables template
├── private-zone-app/          # Main application
│   ├── Dockerfile
│   └── ... (application files)
├── public-site/               # Public website
│   ├── Dockerfile
│   └── ... (application files)
├── mongodb-init/              # MongoDB initialization scripts
└── sql-init/                  # PostgreSQL initialization scripts
```

## Services

- **private-zone-app**: Main dashboard application (Port 3001)
- **public-site**: Public website with authentication (Port 3000)
- **mongodb**: MongoDB database for future migration (Port 27017)
- **postgres**: PostgreSQL database (current) (Port 5434)
- **mongo-express**: MongoDB admin interface (Port 8081)

## Quick Start

1. **Setup Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

2. **Start All Services**
   ```bash
   ./docker-manager.sh start
   ```

3. **Access Applications**
   - Public Site: http://localhost:3000
   - Private Zone App: http://localhost:3001
   - Mongo Express: http://localhost:8081 (admin/admin123)

4. **Login Credentials**
   - Username: `admin`
   - Password: `admin123`
   - Or use the email field: `admin` with password `admin123`

## Docker Manager Commands

The `docker-manager.sh` script provides convenient commands:

```bash
./docker-manager.sh start      # Start all services
./docker-manager.sh stop       # Stop all services
./docker-manager.sh restart    # Restart services
./docker-manager.sh logs       # View logs
./docker-manager.sh rebuild    # Rebuild containers
./docker-manager.sh status     # Show service status
./docker-manager.sh cleanup    # Remove all containers and volumes
./docker-manager.sh shell mongodb  # Open shell in MongoDB container
```

## Manual Docker Commands

If you prefer using Docker Compose directly:

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild containers
docker-compose up -d --build
```

## Environment Variables

Key environment variables in `.env`:

```env
# Google OAuth (required for Gmail/Calendar integration)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback

# Session Security
SESSION_SECRET=your-secret-key-change-in-production

# Database URLs (configured for containers)
MONGODB_URI=mongodb://admin:secretpassword@mongodb:27017/private_zone?authSource=admin
```

## Database Migration Preparation

### Current State
- Applications use PostgreSQL database
- Data includes emails, users, attachments, calendar events

### MongoDB Setup
- MongoDB container is ready for migration
- Initialization scripts in `mongodb-init/`
- Indexes pre-configured for email system performance

### Migration Path
1. **Dual-write phase**: Write to both PostgreSQL and MongoDB
2. **Data migration**: Transfer existing data to MongoDB
3. **Read migration**: Switch reads to MongoDB
4. **Complete migration**: Remove PostgreSQL dependency

## Health Checks

Both applications include health check endpoints:
- Private Zone App: http://localhost:3001/health
- Public Site: http://localhost:3000/health

## Volumes

- `mongodb_data`: MongoDB data persistence
- `postgres_data`: PostgreSQL data persistence
- `./private-zone-app/public/uploads`: File uploads (avatars, attachments)

## Troubleshooting

### Container Issues
```bash
# Check container status
./docker-manager.sh status

# View logs for specific service
./docker-manager.sh logs private-zone-app

# Restart problematic service
docker-compose restart private-zone-app
```

### Database Connection Issues
```bash
# Check if databases are running
docker-compose ps

# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d Ovill

# Connect to MongoDB
docker-compose exec mongodb mongosh -u admin -p secretpassword
```

### Permission Issues
```bash
# Fix upload directory permissions
sudo chown -R $USER:$USER private-zone-app/public/uploads
```

## Development Mode

For development with live reload:

```bash
# Install nodemon in containers
docker-compose exec private-zone-app npm install -g nodemon
docker-compose exec public-site npm install -g nodemon

# Or modify docker-compose.yml to mount source code as volumes
```

## Security Notes

- Change default passwords in production
- Use proper SSL certificates
- Secure MongoDB with authentication
- Regular security updates for base images

## Next Steps for MongoDB Migration

1. Install Mongoose in applications: `npm install mongoose`
2. Create MongoDB schemas
3. Implement data access layer
4. Build migration scripts
5. Test dual-write functionality
6. Execute migration plan
