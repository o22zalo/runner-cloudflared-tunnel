const fs = require('fs');
const path = require('path');
const { getVietnamTime } = require('./time');
const { ensureDir } = require('../adapters/fs-adapter');

/**
 * Logger utility with console and file logging support
 * Supports verbose/quiet modes and automatic log rotation
 */

let logLevel = 'info'; // 'quiet', 'info', 'verbose'
let logFile = null;
let packageInfo = { name: 'unknown', version: '0.0.0' };
let commandName = 'unknown';
let useColor = true;

/**
 * Initialize logger with package info
 */
function init(pkgName, pkgVersion, options = {}) {
  packageInfo = { name: pkgName, version: pkgVersion };
  commandName = options.commandName || commandName;
  logLevel = options.verbose ? 'verbose' : (options.quiet ? 'quiet' : 'info');
  useColor = options.color !== undefined ? options.color : process.stdout.isTTY;
  
  if (options.logFile) {
    logFile = options.logFile;
    const logDir = path.dirname(logFile);
    ensureDir(logDir);
  }
}

/**
 * Get formatted timestamp
 */
function timestamp() {
  return getVietnamTime();
}

/**
 * Mask sensitive data
 * @param {string} value - Value to mask
 * @param {number} showLength - Number of characters to show
 * @returns {string} Masked value
 */
function maskSensitive(value, showLength = 4) {
  if (!value || value.length <= showLength) {
    return 'xxx-Masked-xxx';
  }
  const totalLength = value.length;
  return `xxx-Masked:${totalLength}-xxx`;
}

function colorize(level, message) {
  if (!useColor || process.env.NO_COLOR) {
    return message;
  }

  const colors = {
    info: '\x1b[36m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    success: '\x1b[32m',
    verbose: '\x1b[90m'
  };
  const reset = '\x1b[0m';
  const color = colors[level] || '';
  return color ? `${color}${message}${reset}` : message;
}

/**
 * Write to log file
 */
function writeToFile(message) {
  if (!logFile) return;
  
  try {
    const logMessage = `${message}\n`;
    fs.appendFileSync(logFile, logMessage, 'utf8');
  } catch (error) {
    // Silent fail for file logging
  }
}

/**
 * Format log message
 */
function formatMessage(level, message) {
  const ts = timestamp();
  const prefix = `[${ts}] [${packageInfo.name}@${packageInfo.version}] [${commandName}] [${level.toUpperCase()}]`;
  return `${prefix} ${message}`;
}

function formatConsoleMessage(level, message) {
  return colorize(level, formatMessage(level, message));
}

/**
 * Log info message
 */
function info(message) {
  if (logLevel === 'quiet') return;
  
  const formatted = formatMessage('info', message);
  const consoleFormatted = formatConsoleMessage('info', message);
  console.log(consoleFormatted);
  writeToFile(formatted);
}

/**
 * Log verbose message
 */
function verbose(message) {
  if (logLevel !== 'verbose') return;
  
  const formatted = formatMessage('verbose', message);
  const consoleFormatted = formatConsoleMessage('verbose', message);
  console.log(consoleFormatted);
  writeToFile(formatted);
}

/**
 * Log warning message
 */
function warn(message) {
  const formatted = formatMessage('warn', message);
  const consoleFormatted = formatConsoleMessage('warn', message);
  console.warn(consoleFormatted);
  writeToFile(formatted);
}

/**
 * Log error message
 */
function error(message, err) {
  const formatted = formatMessage('error', message);
  const consoleFormatted = formatConsoleMessage('error', message);
  console.error(consoleFormatted);
  
  if (err && err.stack) {
    console.error(err.stack);
    writeToFile(formatted + '\n' + err.stack);
  } else {
    writeToFile(formatted);
  }
}

/**
 * Log success message
 */
function success(message) {
  if (logLevel === 'quiet') return;
  
  const formatted = formatMessage('success', message);
  const consoleFormatted = formatConsoleMessage('success', message);
  console.log(consoleFormatted);
  writeToFile(formatted);
}

/**
 * Log section header
 */
function section(title) {
  if (logLevel === 'quiet') return;
  
  const separator = '='.repeat(60);
  const formatted = formatMessage('info', `\n${separator}\n${title}\n${separator}`);
  const consoleFormatted = formatConsoleMessage('info', `\n${separator}\n${title}\n${separator}`);
  console.log(consoleFormatted);
  writeToFile(formatted);
}

/**
 * Log configuration with masked sensitive values
 */
function logConfig(config, sensitiveKeys = []) {
  if (logLevel === 'quiet') return;
  
  info('Configuration:');
  Object.keys(config).forEach(key => {
    const value = config[key];
    const isSensitive = sensitiveKeys.includes(key);
    const displayValue = isSensitive ? maskSensitive(value) : value;
    info(`  ${key}:${isSensitive ? displayValue : ` ${displayValue}`}`);
  });
}

/**
 * Log API call information
 */
function logApiCall(method, url, data = null) {
  verbose(`API Call: ${method} ${url}`);
  if (data) {
    verbose(`API Data: ${JSON.stringify(data, null, 2)}`);
  }
}

/**
 * Set log level
 */
function setLevel(level) {
  logLevel = level;
}

/**
 * Get current log level
 */
function getLevel() {
  return logLevel;
}

module.exports = {
  init,
  info,
  verbose,
  warn,
  error,
  success,
  section,
  logConfig,
  logApiCall,
  maskSensitive,
  setLevel,
  getLevel
};
