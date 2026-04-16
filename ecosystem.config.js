module.exports = {
  apps: [{
    name: 'boj-memorial',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 4100
    }
  }]
};
