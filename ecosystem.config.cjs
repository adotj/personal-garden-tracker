/** PM2: pm2 start ecosystem.config.cjs  (from this directory) */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'garden',
      cwd: __dirname,
      script: path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next'),
      args: 'start -H 0.0.0.0 -p 3000',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
    },
  ],
};
