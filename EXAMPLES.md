# Examples

## CLI Examples

### Example 1: Basic SSH Tunnel

Setup a single SSH tunnel:

```bash
export CLOUDFLARED_API_KEY="your_api_key"
export CLOUDFLARED_EMAIL="you@example.com"
export CLOUDFLARED_ACCOUNT_ID="your_account_id"
export CLOUDFLARED_TUNNEL_1="ssh-runner:ssh.myrunner.com:ssh:localhost:22"

cloudflared-tunnel-start
```

Output:
```
[2026-02-04 15:30:00] [runner-cloudflared-tunnel@1.0.0] [INFO] 
============================================================
Cloudflare Tunnel Manager
============================================================
[2026-02-04 15:30:00] [runner-cloudflared-tunnel@1.0.0] [INFO] Version: 1.0.0
[2026-02-04 15:30:00] [runner-cloudflared-tunnel@1.0.0] [INFO] Configuration is valid
[2026-02-04 15:30:01] [runner-cloudflared-tunnel@1.0.0] [SUCCESS] Tunnel created: ssh-runner
[2026-02-04 15:30:02] [runner-cloudflared-tunnel@1.0.0] [SUCCESS] DNS record configured
[2026-02-04 15:30:05] [runner-cloudflared-tunnel@1.0.0] [SUCCESS] ✓ Tunnel setup completed
```

### Example 2: Multiple Services

Setup multiple tunnels for different services:

```bash
export CLOUDFLARED_API_KEY="your_api_key"
export CLOUDFLARED_EMAIL="you@example.com"
export CLOUDFLARED_ACCOUNT_ID="your_account_id"

# SSH access
export CLOUDFLARED_TUNNEL_1="ssh-tunnel:ssh.myrunner.com:localhost:22"

# Web server
export CLOUDFLARED_TUNNEL_2="web-tunnel:web.myrunner.com:localhost:8080"

# API server
export CLOUDFLARED_TUNNEL_3="api-tunnel:api.myrunner.com:localhost:3000"

# Database (PostgreSQL)
export CLOUDFLARED_TUNNEL_4="db-tunnel:db.myrunner.com:localhost:5432"

cloudflared-tunnel-start --verbose
```

### Example 3: Custom Working Directory

Use a specific directory for all data:

```bash
export CLOUDFLARED_API_KEY="your_api_key"
export CLOUDFLARED_EMAIL="you@example.com"
export CLOUDFLARED_ACCOUNT_ID="your_account_id"
export CLOUDFLARED_TUNNEL_1="my-tunnel:tunnel.example.com:localhost:8080"

cloudflared-tunnel-start --cwd /home/runner/cloudflared-data
```

This will create all files in `/home/runner/cloudflared-data/.runner-data/`

### Example 4: Quiet Mode (CI/CD)

Minimal output for CI/CD logs:

```bash
cloudflared-tunnel-start --quiet
```

Only errors will be shown.

### Example 5: Windows with Custom Executable

When cloudflared is not in PATH on Windows:

```bash
set CLOUDFLARED_API_KEY=your_api_key
set CLOUDFLARED_EMAIL=you@example.com
set CLOUDFLARED_ACCOUNT_ID=your_account_id
set CLOUDFLARED_TUNNEL_1=my-tunnel:tunnel.example.com:localhost:8080
set CLOUDFLARED_EXE_PATH=C:\tools\cloudflared.exe

cloudflared-tunnel-start
```

## Library Examples

### Example 1: Simple Integration

Basic integration in a Node.js application:

```javascript
const { startTunnels } = require('runner-cloudflared-tunnel');

async function setupDevEnvironment() {
  try {
    console.log('Setting up Cloudflare tunnels...');
    
    const report = await startTunnels({
      verbose: true
    });
    
    console.log('Success! Tunnels are ready:');
    report.tunnels.forEach(tunnel => {
      console.log(`  ${tunnel.name}: https://${tunnel.hostname}`);
    });
    
    return report;
  } catch (error) {
    console.error('Failed to setup tunnels:', error.message);
    process.exit(1);
  }
}

setupDevEnvironment();
```

### Example 2: Custom Configuration

Override environment variables programmatically:

```javascript
const { TunnelManager, logger } = require('runner-cloudflared-tunnel');

async function setupCustomTunnels() {
  // Custom configuration
  const config = {
    apiKey: process.env.CF_API_KEY,
    email: process.env.CF_EMAIL,
    accountId: process.env.CF_ACCOUNT,
    cwd: '/custom/path',
    tunnels: [
      {
        index: 1,
        name: 'dev-ssh',
        hostname: 'ssh.dev.example.com',
        ip: 'localhost',
        port: '22'
      },
      {
        index: 2,
        name: 'dev-web',
        hostname: 'web.dev.example.com',
        ip: 'localhost',
        port: '3000'
      }
    ]
  };
  
  // Initialize logger
  logger.init('my-app', '1.0.0', { verbose: true });
  
  // Create manager
  const manager = new TunnelManager(config, logger);
  
  // Execute
  await manager.execute();
  
  // Get report
  return manager.generateReport();
}

setupCustomTunnels()
  .then(report => console.log('Done!', report))
  .catch(console.error);
```

### Example 3: Integration with Express Server

Start tunnels when Express server starts:

```javascript
const express = require('express');
const { startTunnels } = require('runner-cloudflared-tunnel');

const app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

async function startServer() {
  // Start Express server
  const server = app.listen(3000, () => {
    console.log('Server running on port 3000');
  });
  
  // Setup Cloudflare tunnel
  try {
    const report = await startTunnels({
      quiet: true,
      logFile: './logs/tunnel.log'
    });
    
    console.log('Tunnel active at:', report.tunnels[0].hostname);
  } catch (error) {
    console.error('Tunnel setup failed:', error.message);
    // Server continues running even if tunnel fails
  }
  
  return server;
}

startServer();
```

## Advanced Examples

### Example 1: CI/CD with Multiple Environments

GitHub Actions workflow for different environments:

```yaml
name: Deploy with Tunnels

on:
  push:
    branches: [main, staging, dev]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          npm install -g runner-cloudflared-tunnel
      
      - name: Setup tunnels for production
        if: github.ref == 'refs/heads/main'
        env:
          CLOUDFLARED_API_KEY: ${{ secrets.CF_API_KEY }}
          CLOUDFLARED_EMAIL: ${{ secrets.CF_EMAIL }}
          CLOUDFLARED_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CLOUDFLARED_TUNNEL_1: prod-api:api.example.com:localhost:8080
        run: cloudflared-tunnel-start --quiet
      
      - name: Setup tunnels for staging
        if: github.ref == 'refs/heads/staging'
        env:
          CLOUDFLARED_API_KEY: ${{ secrets.CF_API_KEY }}
          CLOUDFLARED_EMAIL: ${{ secrets.CF_EMAIL }}
          CLOUDFLARED_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CLOUDFLARED_TUNNEL_1: staging-api:api.staging.example.com:localhost:8080
        run: cloudflared-tunnel-start --quiet
      
      - name: Deploy application
        run: npm run deploy
```

### Example 2: Health Check Script

Script to verify tunnels are running:

```javascript
const fs = require('fs');
const path = require('path');

function checkTunnelHealth() {
  const pidFile = '.runner-data/pid/cloudflared.pid';
  const logFile = '.runner-data/logs/cloudflared/cloudflared.log';
  
  // Check if PID file exists
  if (!fs.existsSync(pidFile)) {
    console.error('Tunnel not running: PID file not found');
    return false;
  }
  
  // Read PID
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
  
  // Check if process is running
  try {
    process.kill(pid, 0);
    console.log(`Tunnel is running (PID: ${pid})`);
  } catch (error) {
    console.error('Tunnel process not found');
    return false;
  }
  
  // Check logs for errors
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, 'utf8');
    const recentLogs = logs.split('\n').slice(-20).join('\n');
    
    if (recentLogs.includes('Registered tunnel connection')) {
      console.log('Tunnel connection is healthy');
      return true;
    } else {
      console.warn('Tunnel may be initializing...');
      console.log('Recent logs:', recentLogs);
    }
  }
  
  return true;
}

checkTunnelHealth();
```

### Example 3: Automatic Restart on Failure

Monitor and restart tunnels if they fail:

```javascript
const { startTunnels } = require('runner-cloudflared-tunnel');
const { sleep } = require('runner-cloudflared-tunnel/src/utils/time');

async function monitorTunnels() {
  while (true) {
    try {
      await startTunnels({ quiet: true });
      console.log('Tunnels started successfully');
      
      // Keep monitoring
      while (true) {
        await sleep(60000); // Check every minute
        
        // Check if still running
        const fs = require('fs');
        const pidFile = '.runner-data/pid/cloudflared.pid';
        
        if (!fs.existsSync(pidFile)) {
          console.log('Tunnel stopped, restarting...');
          break;
        }
        
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
        try {
          process.kill(pid, 0);
          console.log('Tunnel is running');
        } catch (error) {
          console.log('Tunnel process died, restarting...');
          break;
        }
      }
    } catch (error) {
      console.error('Error:', error.message);
      console.log('Retrying in 30 seconds...');
      await sleep(30000);
    }
  }
}

monitorTunnels();
```

## CWD and .runner-data Examples

### Example 1: Project Structure

Typical project structure when using custom CWD:

```
/home/runner/my-project/
├── app/
│   ├── src/
│   └── package.json
├── .runner-data/          # Created by runner-cloudflared-tunnel
│   ├── logs/
│   │   ├── cloudflared-tunnel.log
│   │   └── cloudflared/
│   │       └── cloudflared.log
│   ├── pid/
│   │   └── cloudflared.pid
│   ├── credentials/
│   │   └── <tunnel-id>.json
│   ├── config/
│   │   └── config.yml
│   └── data-services/
└── .env
```

### Example 2: Multiple Projects

Running multiple independent tunnel setups:

```bash
# Project 1
cd /home/runner/project1
export TOOL_CWD=/home/runner/project1
export CLOUDFLARED_TUNNEL_1="proj1-api:api1.example.com:localhost:3001"
cloudflared-tunnel-start

# Project 2 (different directory)
cd /home/runner/project2
export TOOL_CWD=/home/runner/project2
export CLOUDFLARED_TUNNEL_1="proj2-api:api2.example.com:localhost:3002"
cloudflared-tunnel-start
```

Each project has its own `.runner-data` directory.

### Example 3: Accessing Logs Programmatically

```javascript
const fs = require('fs');
const path = require('path');

const cwd = process.env.TOOL_CWD || process.cwd();
const logFile = path.join(cwd, '.runner-data/logs/cloudflared/cloudflared.log');

// Read and parse logs
const logs = fs.readFileSync(logFile, 'utf8');
const lines = logs.split('\n');

// Find connection status
const connectedLines = lines.filter(line => 
  line.includes('Registered tunnel connection')
);

console.log(`Found ${connectedLines.length} successful connections`);

// Get last 10 log entries
const recentLogs = lines.slice(-10);
console.log('Recent logs:', recentLogs.join('\n'));
```
