/* eslint-disable */
const path = require('path');

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
