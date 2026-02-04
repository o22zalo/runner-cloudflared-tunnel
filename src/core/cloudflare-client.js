const httpAdapter = require('../adapters/http-adapter');
const { CloudflareApiError } = require('../utils/errors');

/**
 * Cloudflare API client for tunnel management
 * Handles tunnels, DNS records, and credentials
 */

class CloudflareClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiKey = config.apiKey;
    this.email = config.email;
    this.accountId = config.accountId;
  }
  
  /**
   * Get common request options
   */
  getRequestOptions() {
    return {
      apiKey: this.apiKey,
      email: this.email,
      accountId: this.accountId,
      logger: this.logger
    };
  }
  
  /**
   * List all tunnels for the account
   * @returns {Promise<Array>} List of tunnels
   */
  async listTunnels() {
    this.logger.logApiCall('GET', `/accounts/${this.accountId}/cfd_tunnel`);
    
    const response = await httpAdapter.get(
      `/accounts/${this.accountId}/cfd_tunnel`,
      this.getRequestOptions()
    );
    
    return response.result || [];
  }
  
  /**
   * Get tunnel by name
   * @param {string} name - Tunnel name
   * @returns {Promise<object|null>} Tunnel object or null if not found
   */
  async getTunnelByName(name) {
    const tunnels = await this.listTunnels();
    return tunnels.find(t => t.name === name) || null;
  }
  
  /**
   * Create new tunnel
   * @param {string} name - Tunnel name
   * @returns {Promise<object>} Created tunnel object
   */
  async createTunnel(name) {
    const tunnelSecret = this.generateTunnelSecret();
    this.logger.logApiCall('POST', `/accounts/${this.accountId}/cfd_tunnel`, { name });
    this.logger.info(`Creating tunnel: ${name}`);
    
    const response = await httpAdapter.post(
      `/accounts/${this.accountId}/cfd_tunnel`,
      {
        name,
        tunnel_secret: tunnelSecret
      },
      this.getRequestOptions()
    );
    
    this.logger.success(`Tunnel created: ${name} (ID: ${response.result.id})`);
    return { ...response.result, tunnelSecret };
  }
  
  /**
   * Get tunnel token
   * @param {string} tunnelId - Tunnel ID
   * @returns {Promise<string>} Tunnel token
   */
  async getTunnelToken(tunnelId) {
    this.logger.logApiCall('GET', `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/token`);
    
    const response = await httpAdapter.get(
      `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/token`,
      this.getRequestOptions()
    );
    
    return response.result;
  }
  
  /**
   * Get or create tunnel
   * @param {string} name - Tunnel name
   * @returns {Promise<object>} Tunnel object
   */
  async getOrCreateTunnel(name) {
    let tunnel = await this.getTunnelByName(name);
    
    if (tunnel) {
      this.logger.info(`Tunnel already exists: ${name} (ID: ${tunnel.id})`);
      return { ...tunnel, tunnelSecret: null };
    }
    
    return await this.createTunnel(name);
  }
  
  /**
   * List DNS records for a zone
   * @param {string} zoneId - Zone ID
   * @returns {Promise<Array>} List of DNS records
   */
  async listDnsRecords(zoneId) {
    this.logger.logApiCall('GET', `/zones/${zoneId}/dns_records`);
    
    const response = await httpAdapter.get(
      `/zones/${zoneId}/dns_records`,
      this.getRequestOptions()
    );
    
    return response.result || [];
  }
  
  /**
   * Get DNS record by name
   * @param {string} zoneId - Zone ID
   * @param {string} name - Record name
   * @returns {Promise<object|null>} DNS record or null
   */
  async getDnsRecordByName(zoneId, name) {
    const records = await this.listDnsRecords(zoneId);
    return records.find(r => r.name === name) || null;
  }
  
  /**
   * Create DNS record
   * @param {string} zoneId - Zone ID
   * @param {object} recordData - Record data
   * @returns {Promise<object>} Created record
   */
  async createDnsRecord(zoneId, recordData) {
    this.logger.logApiCall('POST', `/zones/${zoneId}/dns_records`, recordData);
    this.logger.info(`Creating DNS record: ${recordData.name}`);
    
    const response = await httpAdapter.post(
      `/zones/${zoneId}/dns_records`,
      recordData,
      this.getRequestOptions()
    );
    
    this.logger.success(`DNS record created: ${recordData.name}`);
    return response.result;
  }
  
  /**
   * Get zone ID by domain name
   * @param {string} domain - Domain name
   * @returns {Promise<string|null>} Zone ID or null
   */
  async getZoneIdByDomain(domain) {
    if (this.config.zoneId) {
      this.logger.info(`Using configured Zone ID: ${this.config.zoneId}`);
      return this.config.zoneId;
    }

    this.logger.logApiCall('GET', '/zones');

    const response = await httpAdapter.get(
      '/zones',
      this.getRequestOptions()
    );

    const zones = response.result || [];

    if (this.config.zoneName) {
      const zoneByName = zones.find(z => z.name === this.config.zoneName);
      return zoneByName ? zoneByName.id : null;
    }

    // Fallback: guess root domain from hostname (may be incorrect for complex TLDs)
    const parts = domain.split('.');
    const rootDomain = parts.slice(-2).join('.');
    const zone = zones.find(z => z.name === rootDomain);

    if (!zone) {
      this.logger.warn(`Unable to resolve zone using root domain guess: ${rootDomain}`);
    }

    return zone ? zone.id : null;
  }
  
  /**
   * Get or create DNS record
   * @param {string} hostname - Hostname
   * @param {string} tunnelId - Tunnel ID
   * @returns {Promise<object>} DNS record
   */
  async getOrCreateDnsRecord(hostname, tunnelId) {
    // Extract domain from hostname
    const parts = hostname.split('.');
    const domain = parts.slice(-2).join('.');
    
    const zoneId = await this.getZoneIdByDomain(domain);
    if (!zoneId) {
      throw new CloudflareApiError(`Zone not found for domain: ${domain}`, 404);
    }
    
    const existingRecord = await this.getDnsRecordByName(zoneId, hostname);
    if (existingRecord) {
      this.logger.info(`DNS record already exists: ${hostname}`);
      return existingRecord;
    }
    
    return await this.createDnsRecord(zoneId, {
      type: 'CNAME',
      name: hostname,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      ttl: 1
    });
  }
  
  /**
   * Generate random tunnel secret
   * @returns {string} Base64 encoded secret
   */
  generateTunnelSecret() {
    const crypto = require('crypto');
    const secret = crypto.randomBytes(32);
    return secret.toString('base64');
  }
}

module.exports = CloudflareClient;
