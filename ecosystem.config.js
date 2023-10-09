module.exports = {
  apps: [
    {
      name: "translateer",
      script: "npm",
      args: "run bootstrap",
      autorestart: true,
      watch: false,
      env: {
        PAGE_COUNT: 10,
      },
    },
  ],
};
