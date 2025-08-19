module.exports = {
  apps: [
    {
      name: 'nestjs-app',
      script: 'dist/main.js',
      env: {
        NODE_TLS_REJECT_UNAUTHORIZED: '0', 
      },
    },
    {
      name: 'worker',
      script: 'dist/worker/cadence.worker.js',
      env: {
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      },
    },
  ],
};
