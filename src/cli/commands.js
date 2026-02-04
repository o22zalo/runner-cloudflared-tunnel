const { Command } = require('commander');
const path = require('path');
const packageJson = require('../../package.json');
const logger = require('../utils/logger');
const { parseInput, reportConfigStatus, validate, getLogsDir } = require('../core/config');
const { plan } = require('../core/plan');
const TunnelManager = require('../core/tunnel-manager');
const { handleError } = require('../utils/errors');
const { getVietnamDate } = require('../utils/time');

/**
 * CLI command handler
 * Processes command line arguments and executes tunnel setup
 */

/**
 * Create CLI program
 * @returns {Command} Commander program
 */
function createProgram() {
  const program = new Command();
  
  program
    .name('cloudflared-tunnel-start')
    .description('Create and manage Cloudflare tunnels for CI/CD runners')
    .version(packageJson.version)
    .option('--cwd <path>', 'Working directory', process.cwd())
    .option('--verbose', 'Enable verbose logging')
    .option('--quiet', 'Suppress non-error output')
    .option('--log-file <path>', 'Log file path (default: .runner-data/logs/cloudflared-tunnel.log)');
  
  return program;
}

/**
 * Run tunnel start command
 * @param {object} options - CLI options
 * @returns {Promise<void>}
 */
async function runTunnelStart(options) {
  const startTime = Date.now();
  
  try {
    // Parse configuration from environment
    const config = parseInput();
    
    // Override CWD if provided
    if (options.cwd) {
      config.cwd = path.resolve(options.cwd);
    }
    
    // Setup logger
    const logFile = options.logFile || path.join(getLogsDir(config.cwd), 'cloudflared-tunnel.log');
    
    logger.init(packageJson.name, packageJson.version, {
      verbose: options.verbose,
      quiet: options.quiet,
      logFile,
      commandName: 'cloudflared-tunnel-start'
    });
    
    // Log startup information
    logger.section('Cloudflare Tunnel Manager');
    logger.info(`Đang thực thi version: ${packageJson.version}`);
    logger.info(`Version: ${packageJson.version}`);
    logger.info('Command: cloudflared-tunnel-start');
    logger.info(`Date: ${getVietnamDate()}`);
    logger.info(`Working directory: ${config.cwd}`);
    logger.info(`Log file: ${logFile}`);
    
    // Log configuration (mask sensitive values)
    logger.logConfig(config, ['apiKey', 'tunnelToken']);
    const status = reportConfigStatus(config);
    logger.info(`Config present: ${status.present.join(', ') || 'none'}`);
    logger.info(`Config missing: ${status.missing.join(', ') || 'none'}`);
    
    // Validate configuration
    logger.section('Validating Configuration');
    validate(config);
    logger.success('Configuration is valid');
    
    // Plan execution
    const planResult = plan(config, logger);

    // Execute tunnel setup
    const manager = new TunnelManager({ ...config, plan: planResult }, logger);
    await manager.execute();
    
    // Generate and display report
    const report = manager.generateReport();
    
    // Calculate execution time
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.section('Execution Summary');
    logger.success(`Tunnel setup completed successfully in ${duration}s`);
    logger.info('All tunnels are now accessible from the internet');
    
    process.exit(0);
  } catch (error) {
    handleError(error, logger);
  }
}

/**
 * Parse and execute CLI commands
 * @param {string[]} argv - Command line arguments
 * @returns {Promise<void>}
 */
async function execute(argv = process.argv) {
  const program = createProgram();
  
  // Default action (no subcommand)
  program.action(async (options) => {
    await runTunnelStart(options);
  });
  
  await program.parseAsync(argv);
}

module.exports = {
  createProgram,
  execute,
  runTunnelStart
};
