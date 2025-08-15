import { logger } from '../server/utils/logger'
import prisma from '../server/prisma'
import { connectedHosts } from './processVars'

// Constants for reconnection
const AUTO_RECONNECT_CHECK_INTERVAL = 15 * 60 * 1000 // 15 minutes
const HOST_UNREACHABLE_THRESHOLD = 30 * 60 * 1000 // 30 minutes

/**
 * Checks for hosts that have been unreachable for a while and
 * attempts to clean up their state to allow for proper reconnection
 */
async function checkForUnreachableHostsToReset() {
  try {
    const unreachableHosts = await prisma.hostInstance.findMany({
      where: {
        status: 'UNREACHABLE',
      },
      include: {
        apiKey: true,
        organization: true,
      },
    });
    
    if (unreachableHosts.length === 0) return;
    
    logger.info('Found unreachable hosts to check', {
      count: unreachableHosts.length,
      timestamp: new Date().toISOString()
    });
    
    const now = new Date();
    const hostsToReset = [];
    
    for (const host of unreachableHosts) {
      const lastUpdated = host.updatedAt.getTime();
      const timeSinceUpdate = now.getTime() - lastUpdated;
      
      // If the host has been unreachable for longer than our threshold
      if (timeSinceUpdate > HOST_UNREACHABLE_THRESHOLD) {
        hostsToReset.push({
          id: host.id,
          organizationId: host.organizationId,
          apiKeyId: host.apiKeyId,
          timeSinceUpdateMs: timeSinceUpdate,
          lastUpdated: host.updatedAt.toISOString()
        });
        
        // Check if there's a new connection with the same API key
        const apiKeyHasNewConnection = Array.from(connectedHosts.values()).some(
          connectedHost => connectedHost.apiKeyId === host.apiKeyId && connectedHost.ws.id !== host.id
        );
        
        if (apiKeyHasNewConnection) {
          logger.info('API key has a new connection, cleaning up old unreachable host', {
            hostId: host.id,
            apiKeyId: host.apiKeyId,
            organizationId: host.organizationId
          });
          
          // Delete the unreachable host instance to allow for clean reconnection
          await prisma.hostInstance.delete({
            where: { id: host.id }
          });
        } else {
          // Mark as offline instead of deleting to preserve history
          await prisma.hostInstance.update({
            where: { id: host.id },
            data: { status: 'OFFLINE' }
          });
        }
      }
    }
    
    if (hostsToReset.length > 0) {
      logger.info('Reset unreachable hosts', {
        count: hostsToReset.length,
        hosts: hostsToReset,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Error checking for unreachable hosts to reset', {
      error,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Starts the automatic reconnection service
 */
export function startAutoReconnectService() {
  setInterval(checkForUnreachableHostsToReset, AUTO_RECONNECT_CHECK_INTERVAL);
  logger.info('Auto-reconnect service started', {
    checkIntervalMs: AUTO_RECONNECT_CHECK_INTERVAL,
    timestamp: new Date().toISOString()
  });
}

