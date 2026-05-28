#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "============================================="
echo "   🚀 STARTING DEPLOYMENT FOR FILIVE   "
echo "============================================="

# Navigate to the project directory
cd "$(dirname "$0")"
echo "Working directory: $(pwd)"

# 1. Load shell profiles to ensure node, npm, and PM2 are in PATH
echo "📝 Loading environment profiles..."
if [ -f "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
elif [ -f "/usr/share/nvm/init-nvm.sh" ]; then
    . "/usr/share/nvm/init-nvm.sh"
fi

if [ -f "$HOME/.profile" ]; then
    . "$HOME/.profile"
fi

if [ -f "$HOME/.bashrc" ]; then
    . "$HOME/.bashrc"
fi

# Print current Node and NPM versions
echo "Node version: $(node -v 2>/dev/null || echo 'Not Found')"
echo "NPM version: $(npm -v 2>/dev/null || echo 'Not Found')"

# 2. Pull latest changes from Git
echo "🔄 Fetching and pulling latest changes from Git..."
git fetch origin main
git reset --hard origin/main

# 3. Install NPM dependencies
echo "📦 Installing npm dependencies..."
# We run npm install (this includes devDependencies needed for the TypeScript build step)
npm install

# 4. Build TypeScript files
echo "🛠️ Building TypeScript application..."
npm run build

# 5. Prune devDependencies to keep production clean (optional, but standard practice)
# If your app runs with ts-node in production or you want to keep them, you can skip this.
# Since npm run start runs "node dist/index.js", devDependencies are not needed at runtime.
echo "🧹 Pruning development dependencies..."
npm prune --omit=dev

# 6. Restart the application process
echo "🔄 Restarting application process..."

if command -v pm2 &> /dev/null; then
    echo "PM2 detected."
    # Check if the process list contains 'boss-backend' (package.json name) or 'filive'
    if pm2 list | grep -q "boss-backend"; then
        echo "Reloading 'boss-backend'..."
        pm2 reload boss-backend
    elif pm2 list | grep -q "filive"; then
        echo "Reloading 'filive'..."
        pm2 reload filive
    else
        echo "Could not find a specific PM2 app name matching 'boss-backend' or 'filive'."
        echo "PM2 Process List:"
        pm2 list
        echo "Attempting to reload all PM2 processes..."
        pm2 reload all || echo "⚠️ PM2 reload all failed, but continuing..."
    fi
elif command -v supervisorctl &> /dev/null; then
    echo "Supervisor detected. Attempting to restart services..."
    supervisorctl restart all || echo "⚠️ Supervisorctl restart failed, continuing..."
else
    echo "⚠️ PM2 or Supervisor was not detected or is not running."
    echo "Please restart your Node.js server manually if needed (e.g. systemctl restart node-service)."
fi

echo "============================================="
echo "   🎉 DEPLOYMENT COMPLETED SUCCESSFULLY   "
echo "============================================="
