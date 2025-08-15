import { logger } from './logger'
import prisma from '../prisma'
import { connectedHosts, connectedClients } from '../../wss/processVars'

// Constants for health check
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes
const RESTART_THRESHOLD = 3 // Number of consecutive failures before triggering restart
const RESTART_COOLDOWN = 60 * 60 * 1000 // 1 hour cooldown between restarts

// Track health check state
let healthCheckFailures = 0
let lastRestartTime = 0
let isServerHealthy = true

/**
 * Checks if the server is in a healthy state by examining:
 * 1. Connected hosts vs database host instances
 * 2. WebSocket connections
 * 3. Database connectivity
 * 
 * @returns {Promise<boolean>} True if server is healthy, false otherwise
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    logger.info('Performing server health check', {
      connectedHostsCount: connectedHosts.size,
      connectedClientsCount: connectedClients.size,
      timestamp: new Date().toISOString()
    });

    // Check 1: Verify database connectivity
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      logger.error('Database connectivity check failed', {
        error,
        timestamp: new Date().toISOString()
      });
      return false;
    }

    // Check 2: Compare connected hosts with database records
    const hostInstances = await prisma.hostInstance.findMany({
      where: {
        status: 'ONLINE',
      },
    });

    // If we have host instances in the database but no connected hosts,
    // this indicates a potential issue where the server thinks hosts are connected
    // but they're not actually connected via WebSocket
    if (hostInstances.length > 0 && connectedHosts.size === 0) {
      logger.warn('Potential server state inconsistency detected', {
        databaseHostInstancesCount: hostInstances.length,
        connectedHostsCount: connectedHosts.size,
        timestamp: new Date().toISOString()
      });
      
      // Additional check: If this has been the case for a while, it's likely a real issue
      if (healthCheckFailures > 0) {
        return false;
      }
    }

    // Check 3: Verify that hosts marked as connected in the database
    // are actually connected via WebSocket
    const connectedHostIds = Array.from(connectedHosts.keys());
    const disconnectedHosts = hostInstances.filter(
      host => host.status === 'ONLINE' && !connectedHostIds.includes(host.id)
    );

    if (disconnectedHosts.length > 0) {
      logger.warn('Found hosts marked as online in database but not connected via WebSocket', {
        count: disconnectedHosts.length,
        hostIds: disconnectedHosts.map(h => h.id),
        timestamp: new Date().toISOString()
      });
      
      // If there are many hosts in this state, it's likely a server issue
      if (disconnectedHosts.length > 3) {
        return false;
      }
    }

    // All checks passed
    return true;
  } catch (error) {
    logger.error('Error during server health check', {
      error,
      timestamp: new Date().toISOString()
    });
    return false;
  }
}

/**
 * Performs a self-restart if the server is determined to be unhealthy
 * after multiple consecutive checks
 */
async function handleUnhealthyServer() {
  const now = Date.now();
  
  // Check if we're still in cooldown period
  if (now - lastRestartTime < RESTART_COOLDOWN) {
    logger.warn('Server is unhealthy but in restart cooldown period', {
      minutesSinceLastRestart: Math.floor((now - lastRestartTime) / 60000),
      cooldownMinutes: RESTART_COOLDOWN / 60000,
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  logger.error('Server is unhealthy, initiating self-restart', {
    consecutiveFailures: healthCheckFailures,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Update all host instances to UNREACHABLE before restart
    await prisma.hostInstance.updateMany({
      where: {
        status: 'ONLINE'
      },
      data: {
        status: 'UNREACHABLE'
      }
    });
    
    // Record restart time
    lastRestartTime = now;
    
    // Exit process - container orchestration should restart the server
    logger.info('Exiting process to trigger container restart', {
      timestamp: new Date().toISOString()
    });
    
    // Give a moment for logs to flush
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  } catch (error) {
    logger.error('Failed to prepare for server restart', {
      error,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Starts the server health monitoring service
 */
export function startServerHealthMonitoring() {
  logger.info('Starting server health monitoring service', {
    checkIntervalMs: HEALTH_CHECK_INTERVAL,
    restartThreshold: RESTART_THRESHOLD,
    restartCooldownMs: RESTART_COOLDOWN,
    timestamp: new Date().toISOString()
  });
  
  // Perform initial health check
  checkServerHealth().then(isHealthy => {
    isServerHealthy = isHealthy;
    
    if (!isHealthy) {
      healthCheckFailures++;
      logger.warn('Initial server health check failed', {
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Set up periodic health checks
  setInterval(async () => {
    const isHealthy = await checkServerHealth();
    
    if (isHealthy) {
      // Reset failure counter if server is healthy
      if (healthCheckFailures > 0) {
        logger.info('Server health restored', {
          previousFailures: healthCheckFailures,
          timestamp: new Date().toISOString()
        });
        healthCheckFailures = 0;
      }
      isServerHealthy = true;
    } else {
      // Increment failure counter
      healthCheckFailures++;
      isServerHealthy = false;
      
      logger.warn('Server health check failed', {
        consecutiveFailures: healthCheckFailures,
        timestamp: new Date().toISOString()
      });
      
      // If we've reached the threshold, handle the unhealthy server
      if (healthCheckFailures >= RESTART_THRESHOLD) {
        await handleUnhealthyServer();
      }
    }
  }, HEALTH_CHECK_INTERVAL);
}

