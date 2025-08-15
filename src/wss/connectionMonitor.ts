import { logger } from '../server/utils/logger'
import { connectedHosts, connectedClients } from './processVars'

// Connection monitoring stats
let totalConnectionsCreated = 0
let totalConnectionsClosed = 0
let totalHostConnections = 0
let totalClientConnections = 0
let lastConnectionStatsLogged = Date.now()
const CONNECTION_STATS_LOG_INTERVAL = 60 * 60 * 1000 // Log stats every hour
const PING_FAILURE_LOG_INTERVAL = 5 * 60 * 1000 // Log ping failures every 5 minutes

// Track ping failures for monitoring
interface PingFailure {
  instanceId: string;
  type: 'host' | 'client';
  organizationId?: string;
  userId?: string;
  failureCount: number;
  firstFailureTime: Date;
  lastFailureTime: Date;
}

const pingFailures = new Map<string, PingFailure>();
let lastPingFailureLogTime = Date.now();

export function incrementConnectionCreated(type: 'host' | 'client') {
  totalConnectionsCreated++;
  if (type === 'host') {
    totalHostConnections++;
  } else {
    totalClientConnections++;
  }
}

export function incrementConnectionClosed(type: 'host' | 'client') {
  totalConnectionsClosed++;
}

export function recordPingFailure(
  instanceId: string, 
  type: 'host' | 'client', 
  organizationId?: string, 
  userId?: string
) {
  const now = new Date();
  const existing = pingFailures.get(instanceId);
  
  if (existing) {
    existing.failureCount++;
    existing.lastFailureTime = now;
  } else {
    pingFailures.set(instanceId, {
      instanceId,
      type,
      organizationId,
      userId,
      failureCount: 1,
      firstFailureTime: now,
      lastFailureTime: now
    });
  }
  
  // Log ping failures periodically
  const currentTime = Date.now();
  if (currentTime - lastPingFailureLogTime > PING_FAILURE_LOG_INTERVAL) {
    logPingFailures();
    lastPingFailureLogTime = currentTime;
  }
}

export function clearPingFailure(instanceId: string) {
  pingFailures.delete(instanceId);
}

function logPingFailures() {
  if (pingFailures.size === 0) return;
  
  const failuresByType = {
    host: 0,
    client: 0
  };
  
  const criticalFailures = [];
  
  for (const failure of pingFailures.values()) {
    failuresByType[failure.type]++;
    
    // Consider failures with more than 3 consecutive pings as critical
    if (failure.failureCount > 3) {
      criticalFailures.push(failure);
    }
  }
  
  logger.warn('Ping failure statistics', {
    totalFailures: pingFailures.size,
    hostFailures: failuresByType.host,
    clientFailures: failuresByType.client,
    timestamp: new Date().toISOString()
  });
  
  if (criticalFailures.length > 0) {
    logger.error('Critical ping failures detected', {
      count: criticalFailures.length,
      failures: criticalFailures.map(f => ({
        instanceId: f.instanceId,
        type: f.type,
        organizationId: f.organizationId,
        userId: f.userId,
        failureCount: f.failureCount,
        firstFailureTime: f.firstFailureTime,
        lastFailureTime: f.lastFailureTime,
        durationMinutes: Math.round((f.lastFailureTime.getTime() - f.firstFailureTime.getTime()) / (1000 * 60))
      }))
    });
  }
}

export function startConnectionMonitoring() {
  // Log connection stats periodically
  setInterval(() => {
    const now = Date.now();
    const hoursSinceLastLog = (now - lastConnectionStatsLogged) / (1000 * 60 * 60);
    
    logger.info('Connection statistics', {
      totalConnectionsCreated,
      totalConnectionsClosed,
      activeConnections: totalConnectionsCreated - totalConnectionsClosed,
      activeHostConnections: connectedHosts.size,
      activeClientConnections: connectedClients.size,
      hoursSinceLastLog: hoursSinceLastLog.toFixed(2),
      timestamp: new Date().toISOString()
    });
    
    lastConnectionStatsLogged = now;
  }, CONNECTION_STATS_LOG_INTERVAL);
  
  logger.info('Connection monitoring started');
}

