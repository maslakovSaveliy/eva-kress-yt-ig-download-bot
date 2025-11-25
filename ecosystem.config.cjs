module.exports = {
  apps: [
    {
      name: 'eva-kress-bot',
      script: 'dist/index.js',
      watch: false,
      ignore_watch: ['temp', 'node_modules', '*.log'],
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

