const path = require("path");
const fs = require("fs");
const CloudflareClient = require("./cloudflare-client");
const CloudflaredInstaller = require("./cloudflared-installer");
const { getCredentialsDir, getConfigDir, getCloudflaredLogsDir, getPidDir, getDataServicesDir, getTmpDir, getBinDir } = require("./config");
const { ensureDir, writeJson, writeText, readText, verifyPermissions, isWindows } = require("../adapters/fs-adapter");
const { spawnDetached } = require("../adapters/process-adapter");
const { sleep } = require("../utils/time");
const { ProcessError } = require("../utils/errors");
const { isProcessRunning } = require("../adapters/process-adapter");

/**
 * Tunnel manager - Core business logic
 * Handles complete tunnel setup workflow
 */

class TunnelManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.client = new CloudflareClient(config, logger);
    this.installer = new CloudflaredInstaller(config, logger);
    this.tunnelData = null;
  }

  /**
   * Execute complete tunnel setup workflow
   * @returns {Promise<void>}
   */
  async execute() {
    this.logger.section("Starting Cloudflare Tunnel Setup");

    // Step 1: Install cloudflared if needed
    await this.installer.install();

    // Step 2: Setup directories
    this.setupDirectories();

    // Step 3: Process tunnel and services plan
    const plan = this.config.plan || {
      tunnelName: this.config.tunnels[0]?.name,
      services: this.config.tunnels
    };
    await this.processTunnel(plan);

    // Step 4: Generate config file
    await this.generateConfigFile();

    // Step 5: Start all tunnels
    await this.startTunnels();

    // Step 6: Verify tunnels are running
    await this.verifyTunnels();
  }

  /**
   * Setup required directories
   */
  setupDirectories() {
    this.logger.info("Setting up directories...");

    const dirs = [
      getCredentialsDir(this.config.cwd),
      getConfigDir(this.config.cwd),
      getCloudflaredLogsDir(this.config.cwd),
      getPidDir(this.config.cwd),
      getDataServicesDir(this.config.cwd),
      getTmpDir(this.config.cwd),
      getBinDir(this.config.cwd)
    ];

    dirs.forEach((dir) => {
      ensureDir(dir, 0o755);
      this.logger.verbose(`Created directory: ${dir}`);
    });

    this.logger.success("Directories setup completed");
  }

  /**
   * Process single tunnel configuration with multiple services
   * @param {object} plan - Planned tunnel configuration
   * @returns {Promise<void>}
   */
  async processTunnel(plan) {
    this.logger.section(`Processing Tunnel: ${plan.tunnelName}`);

    // Get or create tunnel
    const tunnelInfo = await this.client.getOrCreateTunnel(plan.tunnelName);

    // Get tunnel token for fallback usage
    let token = this.config.tunnelToken;
    if (token) {
      this.logger.info("Using tunnel token from CLOUDFLARED_TUNNEL_TOKEN");
    } else {
      this.logger.info("Fetching tunnel token from Cloudflare API...");
      token = await this.client.getTunnelToken(tunnelInfo.id);
      this.logger.success("Tunnel token retrieved");
    }

    // Create credentials file
    await this.createCredentialsFile(tunnelInfo, token);

    // Setup DNS record
    for (const service of plan.services) {
      await this.setupDnsRecord(service.hostname, tunnelInfo.id);
    }

    // Store tunnel data
    this.tunnelData = {
      tunnelInfo,
      token,
      credentialsPath: this.getCredentialsPath(tunnelInfo.id),
      services: plan.services
    };

    this.logger.success(`Tunnel ${plan.tunnelName} processed successfully`);
  }

  /**
   * Create credentials file for tunnel
   * @param {object} tunnelInfo - Tunnel information
   * @param {string} token - Tunnel token
   * @returns {Promise<void>}
   */
  async createCredentialsFile(tunnelInfo, token) {
    const credentialsPath = this.getCredentialsPath(tunnelInfo.id);

    this.logger.info(`Creating credentials file: ${credentialsPath}`);

    if (!tunnelInfo.tunnelSecret) {
      this.logger.warn('Tunnel secret not available for existing tunnel.');
      this.logger.warn('Using tunnel token as credentials fallback (may not work for all setups).');
      this.logger.warn('Hint: Recreate the tunnel to obtain a static TunnelSecret if cloudflared fails.');
    }

    const credentials = {
      AccountTag: this.config.accountId,
      TunnelSecret: tunnelInfo.tunnelSecret || token,
      TunnelID: tunnelInfo.id,
    };

    writeJson(credentialsPath, credentials, 0o600);

    const permissionCheck = verifyPermissions(credentialsPath, 0o600);
    if (!permissionCheck.ok) {
      const modeText = permissionCheck.actualMode ? permissionCheck.actualMode.toString(8) : 'unknown';
      this.logger.warn(`Credentials file permissions mismatch (expected 600, actual ${modeText}).`);
      if (!isWindows) {
        this.logger.warn('Hint: Ensure the runner user can chmod the credentials file to 600.');
      }
    }

    this.logger.success("Credentials file created");
  }

  /**
   * Get credentials file path
   * @param {string} tunnelId - Tunnel ID
   * @returns {string} Credentials file path
   */
  getCredentialsPath(tunnelId) {
    return path.join(getCredentialsDir(this.config.cwd), `${tunnelId}.json`);
  }

  /**
   * Setup DNS record for hostname
   * @param {string} hostname - Hostname
   * @param {string} tunnelId - Tunnel ID
   * @returns {Promise<void>}
   */
  async setupDnsRecord(hostname, tunnelId) {
    this.logger.info(`Setting up DNS record for ${hostname}...`);

    try {
      await this.client.getOrCreateDnsRecord(hostname, tunnelId);
      this.logger.success(`DNS record configured for ${hostname}`);
    } catch (error) {
      this.logger.warn(`Failed to setup DNS record: ${error.message}`);
      this.logger.warn("You may need to manually configure DNS records in Cloudflare dashboard");
    }
  }

  /**
   * Generate cloudflared config file
   * @returns {Promise<void>}
   */
  async generateConfigFile() {
    this.logger.section("Generating Cloudflared Configuration");

    const configPath = path.join(getConfigDir(this.config.cwd), "config.yml");

    const ingress = [];

    // Add entries for each service
    this.tunnelData.services.forEach((tunnel) => {
      ingress.push({
        hostname: tunnel.hostname,
        service: this.buildServiceUrl(tunnel),
      });
    });

    // Add catch-all rule
    ingress.push({
      service: "http_status:404",
    });

    const config = {
      tunnel: this.tunnelData.tunnelInfo.id,
      "credentials-file": this.tunnelData.credentialsPath,
      ingress: ingress,
    };

    // Convert to YAML format manually
    const yamlContent = this.convertToYaml(config);

    writeText(configPath, yamlContent, 0o644);

    this.logger.success(`Configuration file created: ${configPath}`);
    this.logger.verbose("Configuration content:");
    this.logger.verbose(yamlContent);

    return configPath;
  }

  /**
   * Build a cloudflared service URL for the tunnel
   * @param {object} tunnel - Tunnel service configuration
   * @returns {string} Service URL
   */
  buildServiceUrl(tunnel) {
    const normalizedProtocol = this.normalizeProtocol(tunnel.protocol);
    const protocol = normalizedProtocol || this.inferProtocol(tunnel);
    return `${protocol}://${tunnel.ip}:${tunnel.port}`;
  }

  /**
   * Normalize protocol value
   * @param {string} protocol - Protocol value
   * @returns {string} Normalized protocol
   */
  normalizeProtocol(protocol) {
    if (!protocol) return "";
    return protocol.trim().toLowerCase().replace(/:\/\//g, "");
  }

  /**
   * Infer protocol based on tunnel name and port
   * @param {object} tunnel - Tunnel service configuration
   * @returns {string} Protocol
   */
  inferProtocol(tunnel) {
    const portNum = parseInt(tunnel.port, 10);
    const name = (tunnel.name || "").toLowerCase();

    if (portNum === 22 || portNum === 2222 || name.includes("ssh")) {
      return "ssh";
    }

    if (portNum === 443) {
      return "https";
    }

    const httpPorts = new Set([80, 3000, 3001, 3002, 3003, 4200, 5000, 5173, 8080, 8081]);
    if (httpPorts.has(portNum)) {
      return "http";
    }

    const tcpPorts = new Set([1433, 1521, 27017, 3306, 5432, 6379]);
    if (tcpPorts.has(portNum)) {
      return "tcp";
    }

    return "tcp";
  }

  /**
   * Convert object to YAML format
   * @param {object} obj - Object to convert
   * @returns {string} YAML string
   */
  convertToYaml(obj, indent = 0) {
    const spaces = " ".repeat(indent);
    let yaml = "";

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        value.forEach((item) => {
          if (typeof item === "object") {
            yaml += `${spaces}  -\n`;
            yaml += this.convertToYaml(item, indent + 4);
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        });
      } else if (typeof value === "object" && value !== null) {
        yaml += `${spaces}${key}:\n`;
        yaml += this.convertToYaml(value, indent + 2);
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }

    return yaml;
  }

  /**
   * Start cloudflared tunnels
   * @returns {Promise<void>}
   */
  async startTunnels() {
    this.logger.section("Starting Cloudflared Tunnels");

    const configPath = path.join(getConfigDir(this.config.cwd), "config.yml");
    const logPath = path.join(getCloudflaredLogsDir(this.config.cwd), "cloudflared.log");
    const pidPath = path.join(getPidDir(this.config.cwd), "cloudflared.pid");

    const cloudflaredPath = await this.installer.getCloudflaredPath();

    this.logger.info(`Starting cloudflared with config: ${configPath}`);

    // Ensure log file exists
    ensureDir(path.dirname(logPath));

    // Open log file (sync) to ensure a valid fd for detached stdio
    const logFd = fs.openSync(logPath, "a");

    let child;
    try {
      // Start cloudflared as detached process
      child = spawnDetached(cloudflaredPath, ["tunnel", "--config", configPath, "run"], {
        cwd: this.config.cwd,
        stdout: logFd,
        stderr: logFd,
        logger: this.logger,
      });
    } finally {
      // Close parent fd; child keeps its own handle
      fs.closeSync(logFd);
    }

    // Save PID
    writeText(pidPath, child.pid.toString(), 0o644);

    this.logger.success(`Cloudflared started with PID: ${child.pid}`);
    this.logger.info(`Logs: ${logPath}`);
    this.logger.info(`PID file: ${pidPath}`);

    // Wait a bit for process to start
    await sleep(3000);
  }

  /**
   * Verify tunnels are running
   * @returns {Promise<void>}
   */
  async verifyTunnels() {
    this.logger.section("Verifying Tunnel Status");

    const logPath = path.join(getCloudflaredLogsDir(this.config.cwd), "cloudflared.log");
    const pidPath = path.join(getPidDir(this.config.cwd), "cloudflared.pid");

    const retries = Math.max(1, this.config.verifyRetries || 1);
    const delayMs = this.config.verifyDelay || 3000;
    let lastLogContent = '';

    for (let attempt = 1; attempt <= retries; attempt++) {
      this.logger.info(`Waiting for tunnel to initialize (attempt ${attempt}/${retries})...`);
      await sleep(this.config.timeout || 5000);

      const pidContent = readText(pidPath);
      if (!pidContent) {
        this.logger.warn("PID file not found yet.");
        if (attempt < retries) {
          await sleep(delayMs);
          continue;
        }
        throw new ProcessError("Tunnel failed to start - PID file not found", 1, "");
      }

      const pid = parseInt(pidContent.trim(), 10);
      this.logger.info(`Found PID: ${pid}`);

      if (!isProcessRunning(pid)) {
        this.logger.warn(`Process ${pid} is not running yet.`);
        lastLogContent = readText(logPath) || "";
        if (attempt < retries) {
          await sleep(delayMs);
          continue;
        }
        if (lastLogContent) {
          this.logger.error("Last logs:");
          const lastLines = lastLogContent.split("\n").slice(-20).join("\n");
          this.logger.error(lastLines);
        }
        throw new ProcessError("Cloudflared process died after start", 1, "");
      }

      this.logger.success(`Process is running (PID: ${pid})`);
      lastLogContent = readText(logPath) || "";

      if (lastLogContent.includes("error") || lastLogContent.includes("failed")) {
        this.logger.error("Errors found in cloudflared logs:");
        this.logger.error(lastLogContent);
        throw new ProcessError("Tunnel failed to start - check logs for details", 1, lastLogContent);
      }

      if (lastLogContent.includes("Registered tunnel connection")) {
        this.logger.success("Tunnel is running successfully!");
        break;
      }

      if (attempt === retries) {
        this.logger.warn("Tunnel may still be initializing - check logs for status");
      } else {
        await sleep(delayMs);
      }
    }

    this.logger.info(`Full logs available at: ${logPath}`);
  }

  /**
   * Generate execution report
   * @returns {object} Report data
   */
  generateReport() {
    this.logger.section("Execution Report");

    const report = {
      success: true,
      tunnelsConfigured: 1,
      tunnels: this.tunnelData.services.map((service) => ({
        name: service.name,
        hostname: service.hostname,
        service: this.buildServiceUrl(service),
        tunnelId: this.tunnelData.tunnelInfo.id,
        status: "running",
      })),
      configFile: path.join(getConfigDir(this.config.cwd), "config.yml"),
      logFile: path.join(getCloudflaredLogsDir(this.config.cwd), "cloudflared.log"),
      pidFile: path.join(getPidDir(this.config.cwd), "cloudflared.pid"),
    };

    this.logger.info(`Tunnels configured: ${report.tunnelsConfigured}`);
    report.tunnels.forEach((t) => {
      this.logger.success(`✓ ${t.name}: ${t.hostname} -> ${t.service}`);
    });

    return report;
  }
}

module.exports = TunnelManager;
