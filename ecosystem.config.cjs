module.exports = {
  apps: [
    {
      name: 'demo-backend',
      cwd: './backend',
      script: './mvnw',
      args: 'spring-boot:run',
      interpreter: 'none',
      autorestart: false,
      watch: false,
    },
    {
      name: 'demo-frontend',
      cwd: './frontend',
      script: 'npx',
      args: 'vite --host',
      interpreter: 'none',
      autorestart: false,
      watch: false,
    },
  ],
}
