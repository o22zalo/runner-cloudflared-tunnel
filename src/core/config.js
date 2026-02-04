const path = require('path');
const { ValidationError, ConfigError } = require('../utils/errors');

/**
 * Configuration parser for Cloudflare tunnel setup
 * Reads and validates environment variables
 */

/**
 * Parse tunnel configuration from environment variables
 * Expected format: CLOUDFLARED_TUNNEL_{INDEX}=tunnelname:hostname:ip:port
 * Example: CLOUDFLARED_TUNNEL_1=ssh-tunnel:ssh.example.com:localhost:22
 * 
 * @returns {object} Parsed configuration
 */
function parseInput() {
  const config = {
    apiKey: process.env.CLOUDFLARED_API_KEY || process.env.CLOUDFLARED_GLOBAL_API_KEY || '',
    email: process.env.CLOUDFLARED_EMAIL || '',
    accountId: process.env.CLOUDFLARED_ACCOUNT_ID || '',
    tunnels: [],
    cwd: process.env.TOOL_CWD || process.env.CLOUDFLARED_CWD || process.cwd(),
    cloudflaredPath: process.env.CLOUDFLARED_EXE_PATH || '',
    logLevel: process.env.CLOUDFLARED_LOG_LEVEL || 'info',
    timeout: parseInt(process.env.CLOUDFLARED_TIMEOUT || '30000', 10),
    verifyRetries: parseInt(process.env.CLOUDFLARED_VERIFY_RETRIES || '3', 10),
    verifyDelay: parseInt(process.env.CLOUDFLARED_VERIFY_DELAY || '3000', 10)
  };
  
  // Parse tunnel configurations
  let index = 1;
  while (true) {
    const tunnelEnv = process.env[`CLOUDFLARED_TUNNEL_${index}`];
    if (!tunnelEnv) {
      break;
    }
    
    const parts = tunnelEnv.split(':');
    if (parts.length !== 4) {
      throw new ConfigError(
        `Invalid tunnel configuration at CLOUDFLARED_TUNNEL_${index}: ${tunnelEnv}. ` +
        `Expected format: tunnelname:hostname:ip:port`
      );
    }
    
    const [name, hostname, ip, port] = parts;
    
    config.tunnels.push({
      index,
      name: name.trim(),
      hostname: hostname.trim(),
      ip: ip.trim(),
      port: port.trim()
    });
    
    index++;
  }
  
  return config;
}

/**
 * Validate configuration
 * @param {object} config - Configuration to validate
 * @throws {ValidationError} If configuration is invalid
 */
function validate(config) {
  const errors = [];
  
  // Required fields
  if (!config.apiKey) {
    errors.push('CLOUDFLARED_API_KEY is required');
  }
  
  if (!config.email) {
    errors.push('CLOUDFLARED_EMAIL is required');
  }
  
  if (!config.accountId) {
    errors.push('CLOUDFLARED_ACCOUNT_ID is required');
  }
  
  if (config.tunnels.length === 0) {
    errors.push('At least one tunnel configuration is required (CLOUDFLARED_TUNNEL_1, CLOUDFLARED_TUNNEL_2, ...)');
  }
  
  // Validate tunnel configurations
  config.tunnels.forEach(tunnel => {
    if (!tunnel.name) {
      errors.push(`Tunnel ${tunnel.index}: name is required`);
    }
    
    if (!tunnel.hostname) {
      errors.push(`Tunnel ${tunnel.index}: hostname is required`);
    }
    
    if (!tunnel.ip) {
      errors.push(`Tunnel ${tunnel.index}: ip is required`);
    }
    
    if (!tunnel.port) {
      errors.push(`Tunnel ${tunnel.index}: port is required`);
    }
    
    // Validate port number
    const portNum = parseInt(tunnel.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      errors.push(`Tunnel ${tunnel.index}: invalid port number ${tunnel.port}`);
    }
  });
  
  // Require a single tunnel name for multiple services
  const tunnelNames = Array.from(new Set(config.tunnels.map(t => t.name)));
  if (tunnelNames.length > 1) {
    errors.push(`All tunnel entries must share the same tunnel name. Found: ${tunnelNames.join(', ')}`);
  }
  
  // Check for duplicate hostnames
  const hostnames = config.tunnels.map(t => t.hostname);
  const dupHostnames = hostnames.filter((name, index) => hostnames.indexOf(name) !== index);
  if (dupHostnames.length > 0) {
    errors.push(`Duplicate hostnames found: ${dupHostnames.join(', ')}`);
  }
  
  if (errors.length > 0) {
    throw new ValidationError(
      'Configuration validation failed:\n' + errors.map(e => `  - ${e}`).join('\n')
    );
  }
}

/**
 * Get runner data directory path
 * @param {string} cwd - Current working directory
 * @returns {string} Runner data directory path
 */
function getRunnerDataDir(cwd) {
  return path.join(cwd, '.runner-data');
}

/**
 * Get logs directory path
 * @param {string} cwd - Current working directory
 * @returns {string} Logs directory path
 */
function getLogsDir(cwd) {
  return path.join(getRunnerDataDir(cwd), 'logs');
}

/**
 * Get cloudflared logs directory
 * @param {string} cwd - Current working directory
 * @returns {string} Cloudflared logs directory path
 */
function getCloudflaredLogsDir(cwd) {
  return path.join(getLogsDir(cwd), 'cloudflared');
}

/**
 * Get PID directory path
 * @param {string} cwd - Current working directory
 * @returns {string} PID directory path
 */
function getPidDir(cwd) {
  return path.join(getRunnerDataDir(cwd), 'pid');
}

/**
 * Get data services directory path
 * @param {string} cwd - Current working directory
 * @returns {string} Data services directory path
 */
function getDataServicesDir(cwd) {
  return path.join(getRunnerDataDir(cwd), 'data-services');
}

/**
 * Get credentials directory path
 * @param {string} cwd - Current working directory
 * @returns {string} Credentials directory path
 */
function getCredentialsDir(cwd) {
  return path.join(getRunnerDataDir(cwd), 'credentials');
}

/**
 * Get config directory path
 * @param {string} cwd - Current working directory
 * @returns {string} Config directory path
 */
function getConfigDir(cwd) {
  return path.join(getRunnerDataDir(cwd), 'config');
}

/**
 * Get temp directory path
 * @param {string} cwd - Current working directory
 * @returns {string} Temp directory path
 */
function getTmpDir(cwd) {
  return path.join(getRunnerDataDir(cwd), 'tmp');
}

module.exports = {
  parseInput,
  validate,
  getRunnerDataDir,
  getLogsDir,
  getCloudflaredLogsDir,
  getPidDir,
  getDataServicesDir,
  getCredentialsDir,
  getConfigDir,
  getTmpDir
};
