#!/bin/bash

# === Deployment Script for outbound-ai-backend ===

# Path to your project directory on EC2
APP_DIR="/home/ubuntu/outbound-ai-backend"

# Log current date and time
echo "Deploy started at $(date)"

# Navigate to project directory
cd "$APP_DIR" || {
  echo "❌ Failed to change directory to $APP_DIR"
  exit 1
}

# Pull latest code from GitHub
echo "📥 Pulling latest code..."
git pull origin master || {
  echo "❌ Git pull failed"
  exit 1
}

# Replace .env with .env.production
echo "🔄 Refreshing environment file..."
rm -f .env
cp .env.production .env || {
  echo "❌ Failed to copy .env.production"
  exit 1
}

# Install dependencies
echo "📦 Installing dependencies..."
npm install || {
  echo "❌ npm install failed"
  exit 1
}

# Generate Prisma client
echo "🛠️ Running Prisma generate..."
npx prisma generate || {
  echo "❌ prisma generate failed"
  exit 1
}

# Deploy latest DB migrations
echo "📦 Deploying Prisma migrations..."
npx prisma migrate deploy || {
  echo "❌ prisma migrate deploy failed"
  exit 1
}

# Build the project
echo "🏗️ Building project..."
npm run build || {
  echo "❌ Build failed"
  exit 1
}

# Start or restart PM2 processes
echo "🚀 Restarting services with PM2..."
pm2 start pm2.config.js || pm2 restart pm2.config.js

# Save PM2 state so it persists across reboots
pm2 save

echo "✅ Deployment complete at $(date)"
