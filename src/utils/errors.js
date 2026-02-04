/**
 * Custom error classes for better error handling
 */

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.exitCode = 2;
  }
}

class NetworkError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'NetworkError';
    this.exitCode = 10;
    this.originalError = originalError;
  }
}

class ProcessError extends Error {
  constructor(message, code, stderr) {
    super(message);
    this.name = 'ProcessError';
    this.exitCode = 20;
    this.code = code;
    this.stderr = stderr;
  }
}

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
    this.exitCode = 2;
  }
}

class CloudflareApiError extends Error {
  constructor(message, statusCode, response) {
    super(message);
    this.name = 'CloudflareApiError';
    this.exitCode = 10;
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Handle error and exit with appropriate code
 * @param {Error} error - Error to handle
 * @param {object} logger - Logger instance
 */
function handleError(error, logger) {
  if (error instanceof ValidationError) {
    logger.error('Validation Error: ' + error.message);
    logger.info('Hint: Check your environment variables and configuration');
    process.exit(error.exitCode);
  } else if (error instanceof NetworkError) {
    logger.error('Network Error: ' + error.message);
    if (error.originalError) {
      logger.verbose('Original error: ' + error.originalError.message);
    }
    logger.info('Hint: Check your internet connection and Cloudflare API status');
    process.exit(error.exitCode);
  } else if (error instanceof ProcessError) {
    logger.error('Process Error: ' + error.message);
    if (error.stderr) {
      logger.error('stderr: ' + error.stderr);
    }
    if (error.stderr && error.stderr.toLowerCase().includes('permission')) {
      logger.info('Hint: Permission denied detected. Ensure the runner user can sudo or has write access.');
    } else if (error.stderr && error.stderr.toLowerCase().includes('not found')) {
      logger.info('Hint: Command not found. Verify cloudflared is installed or set CLOUDFLARED_EXE_PATH.');
    } else {
      logger.info('Hint: Check the logs at .runner-data/logs/ for more details');
    }
    process.exit(error.exitCode);
  } else if (error instanceof CloudflareApiError) {
    logger.error('Cloudflare API Error: ' + error.message);
    logger.error('Status Code: ' + error.statusCode);
    if (error.response) {
      logger.verbose('Response: ' + JSON.stringify(error.response, null, 2));
    }
    logger.info('Hint: Check your Cloudflare API credentials and permissions');
    process.exit(error.exitCode);
  } else if (error instanceof ConfigError) {
    logger.error('Configuration Error: ' + error.message);
    logger.info('Hint: Check your .env file and environment variables. Ensure tunnel entries share the same name.');
    process.exit(error.exitCode);
  } else {
    logger.error('Unknown Error: ' + error.message, error);
    logger.info('Hint: This is an unexpected error. Please report it with the stack trace above');
    process.exit(1);
  }
}

module.exports = {
  ValidationError,
  NetworkError,
  ProcessError,
  ConfigError,
  CloudflareApiError,
  handleError
};
