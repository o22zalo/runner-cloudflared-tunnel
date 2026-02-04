const path = require('path');
const os = require('os');
const { commandExists, execute, executeWithSudoFallback, isWindows } = require('../adapters/process-adapter');
const { downloadFile } = require('../adapters/http-adapter');
const { exists, makeExecutable, ensureDir } = require('../adapters/fs-adapter');
const { ProcessError } = require('../utils/errors');
const { getBinDir, getTmpDir } = require('./config');

/**
 * Cloudflared installer
 * Handles installation on Windows and Linux platforms
 */

class CloudflaredInstaller {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.customPath = config.cloudflaredPath;
  }
  
  /**
   * Get cloudflared command path
   * @returns {Promise<string>} Path to cloudflared executable
   */
  async getCloudflaredPath() {
    // Check custom path first
    if (this.customPath && exists(this.customPath)) {
      this.logger.info(`Using custom cloudflared path: ${this.customPath}`);
      return this.customPath;
    }
    
    // Check if cloudflared is in PATH
    if (await commandExists('cloudflared')) {
      this.logger.info('cloudflared found in PATH');
      return 'cloudflared';
    }
    
    return null;
  }
  
  /**
   * Check if cloudflared is installed
   * @returns {Promise<boolean>}
   */
  async isInstalled() {
    const path = await this.getCloudflaredPath();
    return path !== null;
  }
  
  /**
   * Install cloudflared on Windows using chocolatey
   * @returns {Promise<void>}
   */
  async installWindows() {
    this.logger.info('Installing cloudflared on Windows...');
    
    // Check if chocolatey is available
    if (await commandExists('choco')) {
      this.logger.info('Installing via Chocolatey...');
      
      const result = await execute('choco', ['install', 'cloudflared', '-y'], {
        logger: this.logger,
        timeout: 300000 // 5 minutes
      });
      
      if (result.code !== 0) {
        throw new ProcessError(
          'Failed to install cloudflared via Chocolatey',
          result.code,
          result.stderr
        );
      }
      
      this.logger.success('cloudflared installed via Chocolatey');
      return;
    }
    
    // Fallback: Download binary directly
    this.logger.warn('Chocolatey not found, downloading binary directly...');
    await this.downloadWindowsBinary();
  }
  
  /**
   * Download cloudflared binary for Windows
   * @returns {Promise<void>}
   */
  async downloadWindowsBinary() {
    const arch = os.arch() === 'x64' ? 'amd64' : '386';
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${arch}.exe`;
    const binDir = getBinDir(this.config.cwd);
    ensureDir(binDir);
    const destPath = path.join(binDir, 'cloudflared.exe');
    
    this.logger.info(`Downloading cloudflared from ${url}...`);
    await downloadFile(url, destPath);
    
    this.logger.success(`cloudflared downloaded to ${destPath}`);
    this.config.cloudflaredPath = destPath;
  }
  
  /**
   * Install cloudflared on Linux
   * @returns {Promise<void>}
   */
  async installLinux() {
    this.logger.info('Installing cloudflared on Linux...');
    
    const arch = os.arch() === 'x64' ? 'amd64' : (os.arch() === 'arm64' ? 'arm64' : 'arm');
    
    // Download the latest version
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
    const tempDir = getTmpDir(this.config.cwd);
    ensureDir(tempDir);
    const tempPath = path.join(tempDir, 'cloudflared');
    const binDir = getBinDir(this.config.cwd);
    ensureDir(binDir);
    const targetPath = path.join(binDir, 'cloudflared');
    
    this.logger.info(`Downloading cloudflared from ${url}...`);
    await downloadFile(url, tempPath);
    
    // Make executable
    makeExecutable(tempPath);
    
    // Try to move to /usr/local/bin with sudo
    this.logger.info(`Installing to ${targetPath}...`);
    
    try {
      const result = await executeWithSudoFallback('mv', [tempPath, targetPath], {
        logger: this.logger
      });
      
      if (result.code === 0) {
        // Set permissions
        await executeWithSudoFallback('chmod', ['755', targetPath], {
          logger: this.logger
        });
        
        this.logger.success(`cloudflared installed to ${targetPath}`);
        this.config.cloudflaredPath = targetPath;
      } else {
        // Fallback: keep in temp location
        this.logger.warn(`Could not install to ${targetPath}, using temporary location`);
        this.config.cloudflaredPath = tempPath;
      }
    } catch (error) {
      this.logger.warn(`Installation to ${targetPath} failed: ${error.message}`);
      this.config.cloudflaredPath = tempPath;
    }
  }
  
  /**
   * Install cloudflared
   * @returns {Promise<void>}
   */
  async install() {
    if (await this.isInstalled()) {
      this.logger.info('cloudflared is already installed');
      return;
    }
    
    this.logger.section('Installing cloudflared');
    
    if (isWindows) {
      await this.installWindows();
    } else {
      await this.installLinux();
    }
    
    // Verify installation
    if (!await this.isInstalled()) {
      throw new ProcessError('cloudflared installation failed', 1, '');
    }
    
    this.logger.success('cloudflared installation completed');
  }
  
  /**
   * Get cloudflared version
   * @returns {Promise<string>} Version string
   */
  async getVersion() {
    const cloudflaredPath = await this.getCloudflaredPath();
    if (!cloudflaredPath) {
      return 'not installed';
    }
    
    try {
      const result = await executeWithSudoFallback(cloudflaredPath, ['--version'], {
        logger: this.logger
      });
      
      return result.stdout || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }
}

module.exports = CloudflaredInstaller;
