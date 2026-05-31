module.exports = {
  apps: [{
    name: 'ark-alios',
    script: 'server.js',
    env: { PORT: 3007, DB_PATH: './data/alios.db', SESSION_SECRET: process.env.SESSION_SECRET || 'change-me' },
  }],
};
