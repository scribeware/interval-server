import { logger } from '../server/utils/logger'
import { connectedHosts, connectedClients } from './processVars'
import prisma from '../server/prisma'

// Constants for health check intervals
const CONNECTION_HEALTH_CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes
const HOST_STALE_THRESHOLD = 10 * 60 * 1000 // 10 minutes
const CLIENT_STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes

/**
 * Performs a health check on all connected hosts and clients
 * to identify potentially stale connections that haven't been properly closed
 */
async function performConnectionHealthCheck() {
  const now = Date.now();
  logger.verbose('Performing connection health check', {
    connectedHostsCount: connectedHosts.size,
    connectedClientsCount: connectedClients.size,
    timestamp: new Date().toISOString()
  });
  
  // Check for stale host connections
  const staleHosts = [];
  for (const [id, host] of connectedHosts.entries()) {
    try {
      const hostInstance = await prisma.hostInstance.findUnique({
        where: { id },
      });
      
      if (!hostInstance) {
        staleHosts.push({
          id,
          reason: 'Host instance not found in database',
          organizationId: host.organization?.id
        });
        continue;
      }
      
      const lastUpdated = hostInstance.updatedAt.getTime();
      if (now - lastUpdated > HOST_STALE_THRESHOLD) {
        staleHosts.push({
          id,
          reason: 'Host instance not updated recently',
          lastUpdated: hostInstance.updatedAt.toISOString(),
          timeSinceUpdateMs: now - lastUpdated,
          organizationId: host.organization?.id
        });
      }
    } catch (error) {
      logger.error('Error checking host instance health', {
        hostId: id,
        error
      });
    }
  }
  
  // Check for stale client connections
  const staleClients = [];
  for (const [id, client] of connectedClients.entries()) {
    // For clients, we don't have a good way to check staleness from the database
    // So we'll rely on the ping mechanism to handle this
    // This is just a placeholder for future enhancements
  }
  
  // Log results
  if (staleHosts.length > 0) {
    logger.warn('Stale host connections detected', {
      count: staleHosts.length,
      staleHosts,
      timestamp: new Date().toISOString()
    });
  }
  
  if (staleClients.length > 0) {
    logger.warn('Stale client connections detected', {
      count: staleClients.length,
      staleClients,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Starts periodic health checks for all connections
 */
export function startConnectionHealthChecks() {
  setInterval(performConnectionHealthCheck, CONNECTION_HEALTH_CHECK_INTERVAL);
  logger.info('Connection health checks started', {
    checkIntervalMs: CONNECTION_HEALTH_CHECK_INTERVAL,
    timestamp: new Date().toISOString()
  });
}

