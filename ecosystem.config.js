module.exports = {
  apps: [
    {
      name: "translateer",
      script: "npm",
      args: "run bootstrap",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PAGE_COUNT: 10,
      },
    },
  ],
};
