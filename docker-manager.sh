#!/bin/bash

# Docker Compose Management Script for Private Zone Applications

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker and Docker Compose are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available. Please ensure Docker Desktop is running and WSL integration is enabled."
        exit 1
    fi
    
    print_status "Dependencies check passed!"
}

# Create .env file if it doesn't exist
setup_env() {
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating from template..."
        cp .env.example .env
        print_warning "Please edit .env file with your actual values before starting the services."
        return 1
    fi
    return 0
}

# Function to start all services
start_services() {
    print_status "Starting all services..."
    docker compose up -d --build
    
    if [ $? -eq 0 ]; then
        print_status "All services started successfully!"
        print_status "Services running:"
        echo "  - Public Site: http://localhost:3000"
        echo "  - Private Zone App: http://localhost:3001"
        echo "  - MongoDB: localhost:27017"
        echo "  - PostgreSQL: localhost:5433"
        echo "  - Mongo Express: http://localhost:8081 (admin/admin123)"
    else
        print_error "Failed to start services"
        exit 1
    fi
}

# Function to stop all services
stop_services() {
    print_status "Stopping all services..."
    docker compose down
}

# Function to restart services
restart_services() {
    print_status "Restarting services..."
    docker compose up -d --build
}

# Function to view logs
view_logs() {
    if [ -z "$1" ]; then
        print_status "Showing logs for all services..."
        docker compose logs -f
    else
        print_status "Showing logs for $1..."
        docker compose logs -f "$1"
    fi
}

# Function to rebuild services
rebuild_services() {
    print_status "Rebuilding and starting services..."
    docker compose up -d --build
}

# Function to show service status
show_status() {
    print_status "Service status:"
    docker compose ps
}

# Function to clean up everything
cleanup() {
    print_warning "This will remove all containers, volumes, and images. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        print_status "Cleaning up..."
        docker compose down -v --remove-orphans
        docker system prune -f
        print_status "Cleanup completed!"
    else
        print_status "Cleanup cancelled."
    fi
}

# Function to open shell in container
shell() {
    if [ -z "$1" ]; then
        print_error "Please specify a service name (private-zone-app, public-site, mongodb, postgres)"
        exit 1
    fi
    
    print_status "Opening shell in $1..."
    docker compose exec "$1" /bin/sh
}

# Main menu
case "$1" in
    start)
        check_dependencies
        setup_env || exit 1
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    logs)
        view_logs "$2"
        ;;
    rebuild)
        check_dependencies
        rebuild_services
        ;;
    status)
        show_status
        ;;
    cleanup)
        cleanup
        ;;
    shell)
        shell "$2"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs [service]|rebuild|status|cleanup|shell [service]}"
        echo ""
        echo "Commands:"
        echo "  start    - Start all services"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  logs     - View logs (optional: specify service name)"
        echo "  rebuild  - Rebuild and start services"
        echo "  status   - Show service status"
        echo "  cleanup  - Remove all containers, volumes, and images"
        echo "  shell    - Open shell in specified container"
        echo ""
        echo "Services: private-zone-app, public-site, mongodb, postgres, mongo-express"
        exit 1
        ;;
esac
