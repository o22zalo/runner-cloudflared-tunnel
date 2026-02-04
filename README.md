# runner-cloudflared-tunnel

Create and manage Cloudflare tunnels for GitHub Actions and Azure Pipeline runners.

## Features

- ✅ Cross-platform support (Windows & Linux/Ubuntu)
- ✅ CI/CD optimized (GitHub Actions, Azure Pipelines, Self-hosted runners)
- ✅ Automatic cloudflared installation
- ✅ Multiple tunnels in single configuration
- ✅ Automatic DNS record management
- ✅ Sudo fallback for Linux
- ✅ Comprehensive logging
- ✅ Both CLI and Library usage

## Requirements

- Node.js >= 20.0.0
- Cloudflare account with API access
- For Windows: Chocolatey (optional, for auto-install)
- For Linux: sudo access (optional, for auto-install)

## Installation

```bash
npm install runner-cloudflared-tunnel
```

Or globally for CLI usage:

```bash
npm install -g runner-cloudflared-tunnel
```

## Configuration

All configuration is done via environment variables with the `CLOUDFLARED_` prefix.

### Required Environment Variables

```bash
# Cloudflare API credentials
CLOUDFLARED_API_KEY=your_global_api_key
CLOUDFLARED_EMAIL=your_email@example.com
CLOUDFLARED_ACCOUNT_ID=your_account_id

# Tunnel configurations (index starts from 1)
# Format: tunnelname:hostname:ip:port
# Optional: tunnelname:hostname:protocol:ip:port
CLOUDFLARED_TUNNEL_1=ssh-tunnel:ssh.example.com:localhost:22
CLOUDFLARED_TUNNEL_2=web-tunnel:web.example.com:http:localhost:8080
CLOUDFLARED_TUNNEL_3=api-tunnel:api.example.com:localhost:3000
```

### Optional Environment Variables

```bash
# Working directory (default: current directory)
TOOL_CWD=/path/to/working/directory
CLOUDFLARED_CWD=/path/to/working/directory

# Custom cloudflared executable path (for Windows or custom installations)
CLOUDFLARED_EXE_PATH=/path/to/cloudflared.exe

# Log level: quiet, info, verbose (default: info)
CLOUDFLARED_LOG_LEVEL=verbose

# Timeout for tunnel startup verification (default: 30000ms)
CLOUDFLARED_TIMEOUT=30000
```

## Usage

### CLI Usage

#### Basic usage

```bash
cloudflared-tunnel-start
```

#### With options

```bash
# Specify working directory
cloudflared-tunnel-start --cwd /path/to/project

# Verbose logging
cloudflared-tunnel-start --verbose

# Quiet mode
cloudflared-tunnel-start --quiet

# Custom log file
cloudflared-tunnel-start --log-file /path/to/custom.log
```

#### Help

```bash
cloudflared-tunnel-start --help
cloudflared-tunnel-start --version
```

### Library Usage

#### Example 1: Basic usage

```javascript
const { startTunnels } = require('runner-cloudflared-tunnel');

async function main() {
  try {
    const report = await startTunnels();
    console.log('Tunnels started:', report.tunnelsConfigured);
    console.log('Details:', report.tunnels);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

#### Example 2: With custom options

```javascript
const { startTunnels } = require('runner-cloudflared-tunnel');

async function main() {
  const report = await startTunnels({
    cwd: '/path/to/working/directory',
    verbose: true,
    logFile: '/custom/path/to/logs.log'
  });
  
  console.log('Success!', report);
}

main();
```

#### Example 3: Using individual components

```javascript
const { 
  TunnelManager, 
  parseInput, 
  validate,
  logger 
} = require('runner-cloudflared-tunnel');

async function setupTunnels() {
  // Parse configuration from environment
  const config = parseInput();
  
  // Validate configuration
  validate(config);
  
  // Initialize logger
  logger.init('my-app', '1.0.0', { verbose: true });
  
  // Create and execute tunnel manager
  const manager = new TunnelManager(config, logger);
  await manager.execute();
  
  // Get report
  const report = manager.generateReport();
  return report;
}

setupTunnels().catch(console.error);
```

## Directory Structure

The package uses a `.runner-data` directory in the working directory for all its data:

```
<cwd>/
  .runner-data/
    logs/
      cloudflared/
        cloudflared.log         # Cloudflared daemon logs
      cloudflared-tunnel.log    # Package logs
    pid/
      cloudflared.pid           # Process ID file
    credentials/
      <tunnel-id>.json          # Tunnel credentials
    config/
      config.yml                # Cloudflared configuration
    data-services/              # Service data (reserved)
    tmp/                        # Temporary files
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Setup Cloudflare Tunnel

on: [push]

jobs:
  setup-tunnel:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install package
        run: npm install -g runner-cloudflared-tunnel
      
      - name: Start tunnels
        env:
          CLOUDFLARED_API_KEY: ${{ secrets.CLOUDFLARED_API_KEY }}
          CLOUDFLARED_EMAIL: ${{ secrets.CLOUDFLARED_EMAIL }}
          CLOUDFLARED_ACCOUNT_ID: ${{ secrets.CLOUDFLARED_ACCOUNT_ID }}
          CLOUDFLARED_TUNNEL_1: ssh-tunnel:ssh.example.com:localhost:22
        run: cloudflared-tunnel-start --verbose
```

### Azure Pipelines

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: 'Install Node.js'

  - script: |
      npm install -g runner-cloudflared-tunnel
    displayName: 'Install package'

  - script: |
      cloudflared-tunnel-start --verbose
    env:
      CLOUDFLARED_API_KEY: $(CLOUDFLARED_API_KEY)
      CLOUDFLARED_EMAIL: $(CLOUDFLARED_EMAIL)
      CLOUDFLARED_ACCOUNT_ID: $(CLOUDFLARED_ACCOUNT_ID)
      CLOUDFLARED_TUNNEL_1: ssh-tunnel:ssh.example.com:localhost:22
    displayName: 'Start Cloudflare tunnels'
```

### Self-hosted Runner

For self-hosted runners, ensure:

1. Node.js 20+ is installed
2. For Linux: User has sudo access or cloudflared is pre-installed
3. For Windows: Chocolatey is installed or provide `CLOUDFLARED_EXE_PATH`

## Error Codes

The CLI exits with specific codes for different error types:

- `0` - Success
- `1` - Unknown error
- `2` - Validation/Configuration error
- `10` - Network/API error
- `20` - Process/Execution error

## Troubleshooting

### Check logs

All logs are stored in `.runner-data/logs/`:

```bash
# Package logs
cat .runner-data/logs/cloudflared-tunnel.log

# Cloudflared daemon logs
cat .runner-data/logs/cloudflared/cloudflared.log
```

### Common issues

**1. Permission denied on Linux**

The package automatically tries sudo first, then falls back to non-sudo execution.

**2. Cloudflared not installing on Windows**

Install Chocolatey or provide custom path:

```bash
CLOUDFLARED_EXE_PATH=C:\path\to\cloudflared.exe
```

**3. Tunnel not starting**

Check the cloudflared logs for detailed error messages:

```bash
cat .runner-data/logs/cloudflared/cloudflared.log
```

**4. DNS records not created**

You may need to manually create DNS records in Cloudflare dashboard. The package will log warnings if DNS creation fails.

## Architecture

### Module Structure

```
src/
  adapters/           # External integrations
    fs-adapter.js     # File system operations
    http-adapter.js   # HTTP/API calls
    process-adapter.js # Process execution
  
  cli/               # CLI layer
    commands.js      # Command handlers
  
  core/              # Business logic
    config.js        # Configuration parser
    cloudflare-client.js      # Cloudflare API client
    cloudflared-installer.js  # Cloudflared installation
    tunnel-manager.js         # Main tunnel orchestration
  
  utils/             # Utilities
    logger.js        # Logging system
    time.js          # Time utilities (Vietnam timezone)
    errors.js        # Custom error classes
    retry.js         # Retry logic
```

### Workflow

Each command follows a standard pipeline:

1. **parseInput()** - Parse environment variables
2. **validate()** - Validate configuration
3. **plan()** - Check existing resources via API
4. **execute()** - Create/update resources and start tunnels
5. **report()** - Generate execution report

## Development

### Build

```bash
npm run build
```

### Version bump

```bash
npm run version:bump [major|minor|patch]
```

### Publish

```bash
npm run publish:npm
```

## License

MIT

## Author

Senior Node.js Package Architect

## Support

For issues and feature requests, please create an issue in the repository.
