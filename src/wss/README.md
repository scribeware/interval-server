# WebSocket Server Connection Monitoring

This directory contains enhanced monitoring and logging for the WebSocket server to help diagnose connection issues.

## Added Features

### Connection Monitoring (`connectionMonitor.ts`)
- Tracks total connections created and closed
- Records statistics about active connections
- Logs connection statistics periodically
- Tracks ping failures to identify problematic connections

### Connection Health Checks (`connectionHealthCheck.ts`)
- Periodically checks for stale connections
- Identifies hosts that might be connected in the WebSocket server but not properly updated in the database
- Logs detailed information about potentially problematic connections

### Auto-Reconnect Service (`autoReconnect.ts`)
- Identifies hosts that have been unreachable for extended periods
- Cleans up stale host instances to allow for proper reconnection
- Handles cases where a new connection has been established with the same API key

### Enhanced Host Status Checking (`hostStatusCheck.ts`)
- Provides detailed logging about host status changes
- Tracks how many hosts are marked as unreachable
- Logs information about deleted old host instances

## Debugging Connection Issues

When the interval server loses connection and shows "Nothing here yet" in the web UI, check the logs for:

1. **Ping Failures**: Look for logs with "Failed ping to host" or "Critical ping failures detected"
2. **Stale Connections**: Check for "Stale host connections detected" logs
3. **Host Status Changes**: Look for "Hosts marked as unreachable" logs
4. **Connection Statistics**: Review "Connection statistics" logs to see if there's a pattern of connections being created but not properly closed

The enhanced logging should help identify:
- If hosts are being marked as unreachable incorrectly
- If there are network issues causing ping failures
- If there are stale connections that aren't being properly cleaned up
- If there are patterns in when connections are lost

## Potential Causes of Connection Loss

1. **Network Interruptions**: Brief network outages might cause the WebSocket connection to drop
2. **Stale Connections**: The server might think a connection is still active when it's actually dead
3. **Database Inconsistency**: The host status in the database might not match the actual connection state
4. **Memory Issues**: The server might be running out of memory and dropping connections
5. **Rate Limiting**: Excessive message rates might trigger rate limiting and connection drops

The enhanced monitoring should help narrow down which of these is the most likely cause.

