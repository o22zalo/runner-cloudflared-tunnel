/**
 * Main entry point for library usage
 * Exports all public APIs
 */

const { parseInput, reportConfigStatus, validate } = require('./core/config');
const { plan } = require('./core/plan');
const TunnelManager = require('./core/tunnel-manager');
const CloudflareClient = require('./core/cloudflare-client');
const CloudflaredInstaller = require('./core/cloudflared-installer');
const logger = require('./utils/logger');
const packageJson = require('../package.json');

/**
 * Initialize and start Cloudflare tunnels
 * @param {object} options - Configuration options
 * @returns {Promise<object>} Execution report
 */
async function startTunnels(options = {}) {
  // Parse configuration
  const config = parseInput();
  
  // Merge with provided options
  Object.assign(config, options);
  
  // Initialize logger
  logger.init(packageJson.name, packageJson.version, {
    verbose: options.verbose || false,
    quiet: options.quiet || false,
    logFile: options.logFile || null,
    commandName: options.commandName || 'cloudflared-tunnel-start'
  });

  // Log configuration (mask sensitive values)
  logger.logConfig(config, ['apiKey', 'tunnelToken']);
  const status = reportConfigStatus(config);
  logger.info(`Config present: ${status.present.join(', ') || 'none'}`);
  logger.info(`Config missing: ${status.missing.join(', ') || 'none'}`);
  
  // Validate configuration
  validate(config);

  // Plan execution
  const planResult = plan(config, logger);
  
  // Execute tunnel setup
  const manager = new TunnelManager({ ...config, plan: planResult }, logger);
  await manager.execute();
  
  // Return report
  return manager.generateReport();
}

/**
 * Get package version
 * @returns {string} Version string
 */
function getVersion() {
  return packageJson.version;
}

module.exports = {
  // Main functions
  startTunnels,
  getVersion,
  
  // Core classes
  TunnelManager,
  CloudflareClient,
  CloudflaredInstaller,
  
  // Utilities
  logger,
  parseInput,
  validate,
  plan
};
