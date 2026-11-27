/* eslint-disable */
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
try {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (e) {
  // Ignore if logs directory creation is not permitted
}

// Read PORT from .env if present
let port = 5000;
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^\s*PORT\s*=\s*['"]?(\d+)['"]?/m);
    if (match && match[1]) {
      port = parseInt(match[1], 10);
    }
  }
} catch (e) {
  // fallback to 5000
}

module.exports = {
  apps: [
    {
      name: 'filive_backend',
      // Run compiled app directly (do not use `npm start` — that only wraps npm and shows 0b in pm2)
      script: path.join(__dirname, 'dist/index.js'),
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '800M',
      node_args: '--openssl-legacy-provider --disable-warning=DEP0169',
      env: {
        NODE_ENV: 'production',
        PORT: port,
        NODE_OPTIONS: '--max-old-space-size=1024'
      },
      error_file: path.join(__dirname, 'logs/pm2-error.log'),
      out_file: path.join(__dirname, 'logs/pm2-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
