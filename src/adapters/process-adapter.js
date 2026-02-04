const spawn = require('cross-spawn');
const os = require('os');
const { ProcessError } = require('../utils/errors');

/**
 * Process adapter for cross-platform command execution
 * Handles sudo fallback, command detection, and output capture
 */

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

/**
 * Check if running in CI environment
 */
function isCI() {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.AZURE_PIPELINES ||
    process.env.TF_BUILD
  );
}

/**
 * Get default user for CI environments
 */
function getCIUser() {
  if (process.env.GITHUB_ACTIONS) {
    return 'runner';
  }
  if (process.env.AZURE_PIPELINES || process.env.TF_BUILD) {
    return 'vsts';
  }
  return null;
}

/**
 * Check if command exists
 * @param {string} command - Command name
 * @returns {Promise<boolean>}
 */
async function commandExists(command) {
  return new Promise((resolve) => {
    const checkCmd = isWindows ? 'where' : 'which';
    const child = spawn(checkCmd, [command], { stdio: 'ignore' });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });
    
    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Execute command with options
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {object} options - Execution options
 * @returns {Promise<object>} Result with stdout, stderr, code
 */
async function execute(command, args = [], options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdio = 'pipe',
    timeout = 0,
    logger = null
  } = options;
  
  return new Promise((resolve, reject) => {
    if (logger) {
      logger.verbose(`Executing: ${command} ${args.join(' ')}`);
    }
    
    const child = spawn(command, args, {
      cwd,
      env,
      stdio,
      windowsHide: true
    });
    
    let stdout = '';
    let stderr = '';
    let timeoutId = null;
    
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }
    
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }
    
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new ProcessError(`Command timeout after ${timeout}ms`, -1, stderr));
      }, timeout);
    }
    
    child.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
    
    child.on('error', (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      reject(new ProcessError(`Failed to execute ${command}: ${error.message}`, -1, ''));
    });
  });
}

/**
 * Execute command with sudo fallback (Linux only)
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {object} options - Execution options
 * @returns {Promise<object>} Result with stdout, stderr, code
 */
async function executeWithSudoFallback(command, args = [], options = {}) {
  const { logger = null } = options;
  
  if (isWindows) {
    // No sudo on Windows, just execute
    return execute(command, args, options);
  }
  
  // Try with sudo first
  try {
    if (logger) {
      logger.verbose(`Trying with sudo: ${command} ${args.join(' ')}`);
    }
    
    const result = await execute('sudo', [command, ...args], { ...options, timeout: options.timeout || 30000 });
    
    if (result.code === 0) {
      return result;
    }
    
    // Sudo failed, try without
    if (logger) {
      const stderrText = result.stderr ? ` stderr: ${result.stderr}` : '';
      logger.warn(`Sudo failed (code ${result.code})${stderrText}, falling back to non-sudo execution`);
    }
  } catch (error) {
    if (logger) {
      logger.warn(`Sudo execution error: ${error.message}, falling back to non-sudo`);
    }
  }
  
  // Fallback to non-sudo
  if (logger) {
    logger.verbose(`Executing without sudo: ${command} ${args.join(' ')}`);
  }
  
  return execute(command, args, options);
}

/**
 * Spawn detached process (daemon)
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {object} options - Spawn options
 * @returns {object} Child process
 */
function spawnDetached(command, args = [], options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdout = null,
    stderr = null,
    logger = null
  } = options;
  
  if (logger) {
    logger.verbose(`Spawning detached: ${command} ${args.join(' ')}`);
  }
  
  const spawnOptions = {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', stdout || 'ignore', stderr || 'ignore'],
    windowsHide: true
  };
  
  const child = spawn(command, args, spawnOptions);
  
  // Unreference so parent can exit
  child.unref();
  
  return child;
}

/**
 * Check if process is running by PID
 * @param {number} pid - Process ID
 * @returns {boolean}
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Kill process by PID
 * @param {number} pid - Process ID
 * @param {string} signal - Signal to send
 */
function killProcess(pid, signal = 'SIGTERM') {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  isWindows,
  isLinux,
  isCI,
  getCIUser,
  commandExists,
  execute,
  executeWithSudoFallback,
  spawnDetached,
  isProcessRunning,
  killProcess
};
