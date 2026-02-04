/**
 * Plan step for tunnel setup
 * Builds a single-tunnel plan with multiple services.
 */

function plan(config, logger) {
  const tunnelName = config.tunnels[0]?.name || '';
  const services = config.tunnels.map((tunnel) => ({
    name: tunnel.name,
    hostname: tunnel.hostname,
    ip: tunnel.ip,
    port: tunnel.port
  }));

  const planResult = {
    tunnelName,
    services,
    totalServices: services.length
  };

  if (logger) {
    logger.section('Planning Execution');
    logger.info(`Tunnel name: ${tunnelName}`);
    logger.info(`Total services: ${services.length}`);
    services.forEach((service) => {
      logger.verbose(`Service: ${service.hostname} -> ${service.ip}:${service.port}`);
    });
  }

  return planResult;
}

module.exports = {
  plan
};
