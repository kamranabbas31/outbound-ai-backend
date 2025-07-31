module.exports = {
  apps: [
    {
      name: 'nestjs-app',
      script: 'dist/main.js',
    },
    {
      name: 'bullmq-worker',
      script: 'dist/worker/worker.js',
    },
  ],
};
