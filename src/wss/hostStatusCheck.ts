import { logger } from '../server/utils/logger'
import prisma from '../server/prisma'

/**
 * Set all hosts as UNREACHABLE if they haven't been touched
 * in the last minute. The periodic heartbeat will bump
 * this while the host is connected.
 */
export async function checkForUnreachableHosts() {
  try {
    logger.verbose('Checking for unreachable hosts', {
      timestamp: new Date().toISOString()
    });
    
    // Get count of hosts before update
    const beforeCounts = await prisma.$queryRaw`
    SELECT status, COUNT(*) as count
    FROM "HostInstance"
    GROUP BY status
    `;
    
    // Do this with a raw query in order to use database time
    // instead of server time.
    const updateResult = await prisma.$queryRaw`
    update "HostInstance"
    set status = 'UNREACHABLE'
    where status = 'ONLINE'
    and "updatedAt" < (now() - '00:01:00'::interval)
    RETURNING id, "organizationId"
    `;
    
    // Get count of hosts after update
    const afterCounts = await prisma.$queryRaw`
    SELECT status, COUNT(*) as count
    FROM "HostInstance"
    GROUP BY status
    `;
    
    if (Array.isArray(updateResult) && updateResult.length > 0) {
      logger.info('Hosts marked as unreachable', {
        count: updateResult.length,
        hosts: updateResult,
        beforeCounts,
        afterCounts,
        timestamp: new Date().toISOString()
      });
    }

    // Delete old host instances
    const deleteResult = await prisma.$queryRaw`
    delete from "HostInstance"
    where status in ('UNREACHABLE', 'OFFLINE')
    and "updatedAt" < (now() - '06:00:00'::interval)
    RETURNING id, "organizationId"
    `;
    
    if (Array.isArray(deleteResult) && deleteResult.length > 0) {
      logger.info('Old host instances deleted', {
        count: deleteResult.length,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Failed checking for unreachable hosts', {
      error,
      timestamp: new Date().toISOString()
    });
  }
}

